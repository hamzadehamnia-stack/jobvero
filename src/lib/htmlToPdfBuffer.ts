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

/** Render an HTML string to an A4 PDF buffer via Puppeteer. */
export async function htmlToPdfBuffer(html: string): Promise<Buffer> {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 794, height: 1123 });
    await page.setContent(html, { waitUntil: 'load' });
    await new Promise(resolve => setTimeout(resolve, 800));
    await page.addStyleTag({
      content: `@page { size: A4; margin: 0; } html, body { margin: 0; padding: 0; }`,
    });
    const pdfBuffer = await page.pdf({
      format:            'A4',
      printBackground:   true,
      preferCSSPageSize: true,
      margin:            { top: '0', right: '0', bottom: '0', left: '0' },
    });
    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}
