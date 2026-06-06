import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { html, filename } = await req.json();
    if (!html) return NextResponse.json({ error: 'Missing html' }, { status: 400 });

    const puppeteer = await import('puppeteer');
    const browser = await puppeteer.default.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    const page = await browser.newPage();

    // Wrap the CV HTML in a minimal document with A4 dimensions
    const fullHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 794px; background: #fff; }
  @page { size: A4; margin: 0; }
</style>
</head>
<body>${html}</body>
</html>`;

    await page.setContent(fullHtml, { waitUntil: 'networkidle0' });
    await page.setViewport({ width: 794, height: 1123 });

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });

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
