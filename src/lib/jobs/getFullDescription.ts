import type { SupabaseClient } from '@supabase/supabase-js';
import { callOpenRouter } from '@/lib/openrouter';

const AI_MODEL      = 'deepseek/deepseek-chat';
const SCRAPE_MIN    = 400;
const SCRAPE_MAX    = 8000;
const SCRAPE_TIMEOUT = 10_000;

function extractText(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(nav|header|footer|aside|noscript)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(br|p|li|h[1-6]|div|section|article)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export interface FullDescriptionInput {
  jobId:        string;
  redirectUrl?: string | null;
  title:        string;
  company:      string;
  location?:    string;
  salary?:      string;
  contractType?: string;
  sector?:      string;
  excerpt:      string;
}

export async function getFullDescription(
  input: FullDescriptionInput,
  supabase: SupabaseClient,
): Promise<{ description: string; source: 'cache' | 'scrape' | 'ai' } | null> {

  // ── Level 1: Cache ─────────────────────────────────────────────────────────
  try {
    const { data } = await supabase
      .from('job_descriptions_cache')
      .select('description')
      .eq('job_id', input.jobId)
      .maybeSingle();
    if (data?.description) return { description: data.description, source: 'cache' };
  } catch {
    // continue to scraping
  }

  // ── Level 2: Scraping ──────────────────────────────────────────────────────
  if (input.redirectUrl) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), SCRAPE_TIMEOUT);
      const res = await fetch(input.redirectUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        redirect: 'follow',
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        const html = await res.text();
        const text = extractText(html).slice(0, SCRAPE_MAX);
        if (text.length >= SCRAPE_MIN) {
          await supabase.from('job_descriptions_cache').upsert(
            { job_id: input.jobId, description: text, source: 'scrape' },
            { onConflict: 'job_id' },
          ).then(() => null, () => null);
          return { description: text, source: 'scrape' };
        }
      }
    } catch {
      // fall through to AI
    }
  }

  // ── Level 3: AI ────────────────────────────────────────────────────────────
  console.log(`[FULL-DESC] AI fallback jobId=${input.jobId}`);
  try {
    const parts: string[] = [
      `Title: ${input.title}`,
      `Company: ${input.company}`,
    ];
    if (input.location)     parts.push(`Location: ${input.location}`);
    if (input.salary)       parts.push(`Salary: ${input.salary}`);
    if (input.contractType) parts.push(`Contract type: ${input.contractType}`);
    if (input.sector)       parts.push(`Sector: ${input.sector}`);
    parts.push(`Excerpt: ${input.excerpt}`);

    const description = await callOpenRouter(AI_MODEL, [
      {
        role: 'system',
        content:
          'You are a job description writer. Based on the real job data provided, write a ' +
          'complete, professional, well-structured job description: brief intro, key ' +
          'responsibilities, required qualifications, what the role offers. Use the excerpt ' +
          'as factual basis — expand naturally but do NOT invent specific salary numbers or ' +
          'facts not implied. Clean readable paragraphs. Match the language of the excerpt.',
      },
      { role: 'user', content: parts.join('\n') },
    ], 800);

    await supabase.from('job_descriptions_cache').upsert(
      { job_id: input.jobId, description, source: 'ai' },
      { onConflict: 'job_id' },
    ).then(() => null, () => null);

    return { description, source: 'ai' };
  } catch {
    return null;
  }
}
