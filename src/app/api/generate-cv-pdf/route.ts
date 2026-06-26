import React from 'react';
import { NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { createClient } from '@/lib/supabase/server';
import type { CVFormData } from '@/components/cv-builder/types';
import {
  ParisPDF, BordeauxPDF, AmericanPDF, NewYorkPDF, LondonPDF,
} from '@/components/cv-builder/pdf';
import { htmlToPdfBuffer } from '@/lib/htmlToPdfBuffer';

// Allow up to 30s — Puppeteer launch + page.setContent + page.pdf can take 5–15s
export const maxDuration = 30;

// ── Path A helper (react-pdf templates — unchanged) ──────────────────────────

function getPDFElement(templateId: string, data: CVFormData): React.ReactElement | null {
  switch (templateId) {
    case 'paris-elegant':      return React.createElement(ParisPDF,    { data });
    case 'bordeaux-classique': return React.createElement(BordeauxPDF, { data });
    case 'american-classic':   return React.createElement(AmericanPDF, { data });
    case 'new-york-modern':    return React.createElement(NewYorkPDF,  { data });
    case 'london-executive':   return React.createElement(LondonPDF,   { data });
    default: return null;
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { html, filename, templateId, userData } = body as {
      html?:       string;
      filename?:   string;
      templateId?: string;
      userData?:   CVFormData;
    };

    const safeName = ((filename ?? 'cv') + '.pdf')
      .replace(/[^a-z0-9-_.]/gi, '-')
      .toLowerCase();

    // ── Path B: Claude-generated HTML → Puppeteer → text-selectable PDF ───────
    if (html) {
      const pdfBuffer = await htmlToPdfBuffer(html);
      return new NextResponse(new Uint8Array(pdfBuffer), {
        headers: {
          'Content-Type':        'application/pdf',
          'Content-Disposition': `attachment; filename="${safeName}"`,
          'Content-Length':      String(pdfBuffer.byteLength),
        },
      });
    }

    // ── Path A: Template-based → react-pdf (unchanged) ────────────────────────
    if (!templateId || !userData) {
      return NextResponse.json(
        { error: 'Provide html for Claude CVs, or (templateId + userData) for template CVs.' },
        { status: 400 },
      );
    }
    const element = getPDFElement(templateId, userData);
    if (!element) {
      return NextResponse.json(
        { error: `Unknown template: ${templateId}` },
        { status: 400 },
      );
    }
    const pdfBuffer = await renderToBuffer(element);
    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `attachment; filename="${safeName}"`,
        'Content-Length':      String(pdfBuffer.byteLength),
      },
    });

  } catch (err) {
    console.error('[generate-cv-pdf]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'PDF generation failed' },
      { status: 500 },
    );
  }
}
