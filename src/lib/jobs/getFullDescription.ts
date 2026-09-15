import { createAdminClient } from '@/lib/supabase/admin';
import { safeFetch } from '@/lib/ssrfGuard';

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
}

// The full text of a job offer: from the cache, else scraped from the offer's
// own page. There is no AI level. A model asked to write "a complete job
// description" from a title and an excerpt invents an offer, and a candidate
// applying to an invented offer is worse off than one reading the excerpt —
// so when the page cannot be read, callers keep the excerpt they already have.
//
// The cache is shared by every user and feeds auto-apply's CV tailoring, so no
// user may touch it: it is read and written with the service role only, and
// clients hold no privilege on the table.
export async function getFullDescription(
  input: FullDescriptionInput,
): Promise<{ description: string; source: 'cache' | 'scrape' } | null> {
  const cache = createAdminClient();

  // ── Level 1: Cache ─────────────────────────────────────────────────────────
  try {
    const { data } = await cache
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
      // safeFetch, not fetch: redirectUrl arrives in the body of
      // POST /api/jobs/full-description, so the caller picks the host. Same
      // exposure as the email-finder scraper — private, loopback and
      // link-local targets are refused and every redirect hop is re-checked,
      // which the previous redirect: 'follow' did not do.
      const res = await safeFetch(input.redirectUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        const html = await res.text();
        const text = extractText(html).slice(0, SCRAPE_MAX);
        if (text.length >= SCRAPE_MIN) {
          await cache.from('job_descriptions_cache').upsert(
            { job_id: input.jobId, description: text, source: 'scrape' },
            { onConflict: 'job_id' },
          ).then(() => null, () => null);
          return { description: text, source: 'scrape' };
        }
      }
    } catch {
      // unreadable page: no description
    }
  }

  return null;
}
