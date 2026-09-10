// Security regression test for src/lib/pdfPageGuard.ts
//
// Run it:  node security-tests/pdfPageGuard.test.js
//
// Mirrors applyPdfNetworkAllowlist from that file (TypeScript, @/ alias).
// KEEP THE TWO IN SYNC.
//
// Does the PDF network allowlist actually stop SSRF?
// Starts a local "internal service" on 127.0.0.1, then renders HTML that tries
// to reach it, with and without the guard.
const http = require('http');
const puppeteer = require('puppeteer');

const ALLOWED_PREFIXES = ['https://fonts.googleapis.com/', 'https://fonts.gstatic.com/'];

async function applyPdfNetworkAllowlist(page) {
  await page.setRequestInterception(true);
  const mainFrame = page.mainFrame();
  page.on('request', (request) => {
    const url = request.url();
    const isMainFrameNavigation = request.isNavigationRequest() && request.frame() === mainFrame;
    const allowed =
      isMainFrameNavigation ||
      url.startsWith('data:') ||
      url === 'about:blank' ||
      ALLOWED_PREFIXES.some((p) => url.startsWith(p));
    const settle = allowed ? request.continue() : request.abort();
    void settle.catch(() => undefined);
  });
}

(async () => {
  let hits = 0;
  const server = http.createServer((req, res) => {
    hits++;
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<h1>INTERNAL SECRET DATA</h1>');
  });
  await new Promise((r) => server.listen(9931, '127.0.0.1', r));

  const attack = `<iframe src="http://127.0.0.1:9931/metadata" width="700" height="300"></iframe>
                  <img src="http://127.0.0.1:9931/pixel.png">`;

  let failed = 0;

  // --- without the guard: prove the vector is real ---
  {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    hits = 0;
    await page.setContent(`<!DOCTYPE html><html><body>${attack}</body></html>`, { waitUntil: 'load' });
    await new Promise((r) => setTimeout(r, 800));
    await browser.close();
    console.log(`unguarded  -> internal service hit ${hits} time(s)  ${hits > 0 ? '(vector confirmed)' : '(NOT reproduced)'}`);
    if (hits === 0) { failed++; console.log('  WARN: could not reproduce the vector, test is inconclusive'); }
  }

  // --- with the guard: must be zero ---
  {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await applyPdfNetworkAllowlist(page);
    hits = 0;
    await page.setContent(`<!DOCTYPE html><html><body>${attack}</body></html>`, { waitUntil: 'load' });
    await new Promise((r) => setTimeout(r, 800));
    await browser.close();
    console.log(`guarded    -> internal service hit ${hits} time(s)  ${hits === 0 ? 'BLOCKED' : 'STILL REACHABLE'}`);
    if (hits !== 0) failed++;
  }

  // --- legitimate document must still render ---
  {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await applyPdfNetworkAllowlist(page);
    await page.setContent(
      `<!DOCTYPE html><html><head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">
       </head><body><div style="font-family:Inter,Arial;padding:40px"><h1>Jane Doe</h1><p>Engineer</p></div></body></html>`,
      { waitUntil: 'load' },
    );
    await new Promise((r) => setTimeout(r, 800));
    const pdf = await page.pdf({ format: 'A4', printBackground: true });
    await browser.close();
    const buf = Buffer.from(pdf);
    const ok = buf.subarray(0, 5).toString('latin1') === '%PDF-' && buf.length > 1000;
    console.log(`legit PDF  -> ${buf.length} bytes, magic ${buf.subarray(0, 5).toString('latin1')}  ${ok ? 'OK' : 'FAILED'}`);
    if (!ok) failed++;
  }

  server.close();
  console.log(`\n${failed === 0 ? 'ALL CHECKS PASSED' : failed + ' CHECK(S) FAILED'}`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
