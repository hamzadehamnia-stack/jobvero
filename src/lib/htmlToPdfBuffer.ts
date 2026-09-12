import { applyPdfNetworkAllowlist } from '@/lib/pdfPageGuard';
import {
  measureContentHeight,
  markAtomicBlocks,
  choosePageStrategy,
  PAGE_BREAK_CSS,
  PDF_PAGE_WIDTH_PX,
} from '@/lib/pdfPageSize';

async function launchBrowser() {
  if (process.env.NODE_ENV === 'development') {
    try {
      const puppeteer = await import('puppeteer');
      return puppeteer.default.launch({ headless: true });
    } catch {
      // fall through to puppeteer-core
    }
  }
  const CHROMIUM_PACK_URL =
    'https://github.com/Sparticuz/chromium/releases/download/v149.0.0/chromium-v149.0.0-pack.x64.tar';
  const [puppeteerCore, chromium] = await Promise.all([
    import('puppeteer-core'),
    import('@sparticuz/chromium-min'),
  ]);
  return puppeteerCore.default.launch({
    args:           chromium.default.args,
    executablePath: await chromium.default.executablePath(CHROMIUM_PACK_URL),
    headless:       true,
  });
}

/**
 * Guarantee a doctype, so the document renders in standards mode.
 *
 * This is not cosmetic. The CV prompt tells the model to begin its output with
 * the Google Fonts <link>, so the HTML arriving here has no doctype and
 * Chromium falls back to quirks mode — where html and body stretch to the full
 * viewport height whatever the content. The page then measures as a complete A4
 * sheet even when the CV fills a third of it, which is the blank space this
 * whole change is about. Setting `height: auto` does not undo it; only the
 * doctype does.
 */
function withDoctype(html: string): string {
  return /^\s*<!doctype/i.test(html) ? html : `<!DOCTYPE html>\n${html}`;
}

/** Render an HTML string to a PDF buffer sized to its content, via Puppeteer. */
export async function htmlToPdfBuffer(html: string): Promise<Buffer> {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    // Same reasoning as api/generate-pdf: the HTML rendered here originates
    // outside this process, so the browser's network access is allowlisted.
    await applyPdfNetworkAllowlist(page);
    await page.setViewport({ width: PDF_PAGE_WIDTH_PX, height: 1123 });
    await page.setContent(withDoctype(html), { waitUntil: 'load' });
    await new Promise(resolve => setTimeout(resolve, 800));

    // `size` is deliberately absent from @page. It used to read
    // `@page { size: A4 }`, and combined with preferCSSPageSize below that made
    // the CSS win over the width/height options — the page stayed A4 no matter
    // what was passed, which is why a short CV came out with a sheet of blank
    // paper under it. `margin: 0` stays: it suppresses Chromium's default print
    // margins, which are unrelated to the sheet size.
    await page.addStyleTag({
      content: `
        @page { margin: 0; }
        html, body { margin: 0; padding: 0; }
        /* Every CV template pins min-height:1123px on its wrapper — and the
           generate-cv prompt asks the model for the same on the sidebar — so
           the on-screen preview looks like a full sheet of paper. In a
           content-sized PDF that pin IS the blank space being removed: without
           this override a one-third-full CV still measures a whole A4 page.
           Overridden only here, so the preview keeps its full-page look.
           Flex children still stretch to their row, so a full-height sidebar
           stays full-height — simply on a shorter page. */
        body, body * { min-height: 0 !important; }
        ${PAGE_BREAK_CSS}
      `,
    });

    // Measured after the style tag and the settle delay, so webfonts have
    // swapped in and the height reflects the final layout rather than a
    // fallback face with different metrics.
    const contentHeight = await measureContentHeight(page);

    // A CV is both a screen document and a printed one, so the page is either
    // cut to the content or laid out on true A4 sheets — see
    // choosePageStrategy for the three outcomes.
    const margin   = { top: '0', right: '0', bottom: '0', left: '0' };
    const strategy = choosePageStrategy(contentHeight);

    if (strategy.mode === 'fitted') {
      const pdfBuffer = await page.pdf({
        width:           `${PDF_PAGE_WIDTH_PX}px`,
        height:          `${strategy.heightPx}px`,
        printBackground: true,
        margin,
      });
      return Buffer.from(pdfBuffer);
    }

    await markAtomicBlocks(page);
    const pdfBuffer = await page.pdf({
      format:          'A4',
      printBackground: true,
      // Below 1 only when a small overflow is being pulled back onto whole
      // sheets. Chromium applies this during print layout, so the content
      // genuinely reflows into the page count the strategy asked for.
      scale:           strategy.scale,
      margin,
    });
    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}
