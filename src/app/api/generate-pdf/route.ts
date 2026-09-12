import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { applyPdfNetworkAllowlist } from '@/lib/pdfPageGuard';
import {
  measureContentHeight,
  markAtomicBlocks,
  A4_PAGE_HEIGHT_PX,
  PAGE_BREAK_CSS,
  PDF_PAGE_WIDTH_PX,
} from '@/lib/pdfPageSize';

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { html, filename } = await req.json();
    if (!html) return NextResponse.json({ error: 'Missing html' }, { status: 400 });

    const puppeteer = await import('puppeteer');
    const browser = await puppeteer.default.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    const page = await browser.newPage();
    // `html` is caller-supplied and rendered by a real browser inside the
    // deployment. Without this, an <iframe> or <img> pointing at an internal
    // address renders that response into the PDF returned to the caller.
    await applyPdfNetworkAllowlist(page);

    // Wrap the document at the template's layout width. `@page` no longer sets
    // `size`: with a fixed A4 sheet, a CV or letter that filled a third of the
    // page produced a PDF with two thirds of blank paper under it. `margin: 0`
    // stays — it suppresses Chromium's default print margins, which have
    // nothing to do with the sheet size.
    const fullHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${PDF_PAGE_WIDTH_PX}px; background: #fff; }
  @page { margin: 0; }
  /* CV templates pin min-height:1123px on their wrapper so the on-screen
     preview looks like a full sheet. On a content-sized page that pin is
     exactly the blank space being removed, so it is dropped for the PDF only.
     Flex children still stretch to their row, so a full-height sidebar stays
     full-height on the shorter page. */
  body, body * { min-height: 0 !important; }
  ${PAGE_BREAK_CSS}
</style>
</head>
<body>${html}</body>
</html>`;

    // Viewport before setContent, not after. It used to be set afterwards, so
    // the document was laid out at Chromium's default 800×600 and only then
    // reflowed — which would make any height measured here describe the wrong
    // layout.
    await page.setViewport({ width: PDF_PAGE_WIDTH_PX, height: 1123 });

    // 'load' + a settle delay, matching lib/htmlToPdfBuffer.ts. Puppeteer 24.43
    // narrowed setContent's waitUntil to 'load' | 'domcontentloaded', so
    // 'networkidle0' no longer type-checks. 'load' already waits for
    // stylesheets and images — which is what this document needs — and the
    // delay covers webfont swap-in, the thing networkidle0 was buying here.
    await page.setContent(fullHtml, { waitUntil: 'load' });
    await new Promise(resolve => setTimeout(resolve, 800));

    // Measured after the fonts have settled, so the height reflects the final
    // layout rather than a fallback face with different metrics.
    const contentHeight = await measureContentHeight(page);

    // Two modes, matching lib/htmlToPdfBuffer.ts. A document that fits on one
    // sheet gets a page sized to it, so nothing blank hangs underneath;
    // anything longer falls back to real A4 pagination, because a single
    // continuous page several sheets tall prints badly and these documents do
    // get printed.
    const margin = { top: '0', right: '0', bottom: '0', left: '0' };
    let pdf: Uint8Array;

    if (contentHeight <= A4_PAGE_HEIGHT_PX) {
      pdf = await page.pdf({
        width: `${PDF_PAGE_WIDTH_PX}px`,
        height: `${contentHeight}px`,
        printBackground: true,
        margin,
      });
    } else {
      await markAtomicBlocks(page);
      pdf = await page.pdf({ format: 'A4', printBackground: true, margin });
    }

    await browser.close();

    const safeName = (filename ?? 'cv').replace(/[^a-z0-9-_]/gi, '-').toLowerCase();

    return new NextResponse(Buffer.from(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${safeName}.pdf"`,
        'Content-Length': String(pdf.byteLength),
      },
    });
  } catch (err) {
    console.error('PDF generation error:', err);
    return NextResponse.json({ error: 'PDF generation failed' }, { status: 500 });
  }
}
