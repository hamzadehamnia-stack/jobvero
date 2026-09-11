// Regression test for src/lib/pdfPageSize.ts + src/lib/htmlToPdfBuffer.ts
//
// Run it:  node security-tests/pdfPageSize.test.js
//
// The PDF page used to be a fixed A4 sheet, so a CV filling a third of it came
// out with two thirds of blank paper underneath. The page is now sized to the
// content. This renders a short and a long CV through the same sequence the
// library uses, then reads the real geometry back out of the produced PDF
// bytes (/MediaBox) rather than trusting the options that were passed in.
//
// Mirrors measureContentHeight/withDoctype from those files (TypeScript, @/
// alias). KEEP IN SYNC.

const puppeteer = require('puppeteer');

const PDF_PAGE_WIDTH_PX = 794;      // A4 width at 96dpi === 595pt. NOT 595px.
const PX_PER_PT = 72 / 96;

const withDoctype = (html) =>
  /^\s*<!doctype/i.test(html) ? html : `<!DOCTYPE html>\n${html}`;

// Mirrors the style tag injected by lib/htmlToPdfBuffer.ts.
const PDF_CSS = `
  @page { margin: 0; }
  html, body { margin: 0; padding: 0; }
  body, body * { min-height: 0 !important; }
`;

async function measureContentHeight(page) {
  const measured = await page.evaluate(() => {
    const body = document.body;
    if (!body) return { extent: 0, bodyBox: 0, quirks: false };
    const quirks = document.compatMode === 'BackCompat';
    const origin = window.scrollY;
    let extent = 0;
    for (const el of Array.from(body.querySelectorAll('*'))) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      if (getComputedStyle(el).position === 'fixed') continue;
      extent = Math.max(extent, rect.bottom + origin);
    }
    const style = getComputedStyle(body);
    extent += (parseFloat(style.paddingBottom) || 0) + (parseFloat(style.borderBottomWidth) || 0);
    return { extent, bodyBox: body.getBoundingClientRect().bottom + origin, quirks };
  });

  const candidates = [measured.extent];
  if (!measured.quirks) {
    candidates.push(measured.bodyBox);
    const handle = await page.$('body');
    if (handle) {
      const box = await handle.boundingBox();
      if (box) candidates.push(box.height);
      await handle.dispose();
    }
  }
  const height = Math.ceil(Math.max(...candidates));
  return height > 0 ? height : 1123;
}

// A CV the way the model emits it: raw HTML starting with the fonts <link>,
// no doctype, no <html> wrapper.
function cv(entries) {
  const block = (i) => `
    <div style="margin-bottom:18px">
      <h3 style="font-size:15px;color:#1a1a2e;margin:0 0 4px">Senior Engineer — ACME ${i}</h3>
      <p style="font-size:12px;color:#666;margin:0 0 6px">Jan 2019 – Dec 2022 · Paris, France</p>
      <p style="font-size:13px;line-height:1.7;color:#333;margin:0">
        Led the platform team through a migration to a service architecture.
        Cut p95 latency by 40%, owned the on-call rotation, mentored four engineers.
      </p>
    </div>`;
  // Reproduces the real template shape: flex wrapper pinned to a full A4 sheet
  // via min-height, plus a sidebar that relies on flex stretch for its height.
  return `<link href="https://fonts.googleapis.com/css2?family=Inter" rel="stylesheet">
  <div id="wrapper" style="font-family:Inter,Arial,sans-serif;max-width:794px;margin:0 auto;background:#fff;display:flex;min-height:1123px;box-sizing:border-box;">
  <div id="sidebar" style="width:220px;flex-shrink:0;background:#1a1a2e;padding:32px 20px;box-sizing:border-box;min-height:1123px;"></div>
  <div style="flex:1;padding:48px">
    <h1 style="font-size:28px;color:#1a1a2e;margin:0 0 4px">Jane Doe</h1>
    <p style="font-size:13px;color:#666;margin:0 0 24px">jane@example.com · Paris</p>
    <h2 style="font-size:16px;color:#7C3AED;border-bottom:2px solid #7C3AED;padding-bottom:4px;margin:0 0 14px">Experience</h2>
    ${Array.from({ length: entries }, (_, i) => block(i + 1)).join('')}
  </div></div>`;
}

function geometry(buf) {
  const s = buf.toString('latin1');
  const boxes = [...s.matchAll(/\/MediaBox\s*\[\s*([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s*\]/g)]
    .map((m) => ({ w: parseFloat(m[3]) - parseFloat(m[1]), h: parseFloat(m[4]) - parseFloat(m[2]) }));
  return { boxes, pages: (s.match(/\/Type\s*\/Page[^s]/g) || []).length };
}

async function render(browser, html, { legacy = false } = {}) {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: PDF_PAGE_WIDTH_PX, height: 1123 });
    await page.setContent(legacy ? html : withDoctype(html), { waitUntil: 'load' });
    await new Promise((r) => setTimeout(r, 300));

    if (legacy) {
      await page.addStyleTag({ content: `@page { size: A4; margin: 0; } html, body { margin: 0; padding: 0; }` });
      const pdf = await page.pdf({
        format: 'A4', printBackground: true, preferCSSPageSize: true,
        margin: { top: '0', right: '0', bottom: '0', left: '0' },
      });
      return { buf: Buffer.from(pdf) };
    }

    await page.addStyleTag({ content: PDF_CSS });
    const contentHeight = await measureContentHeight(page);
    const sidebar = await page.evaluate(() => {
      const s = document.getElementById('sidebar');
      const w = document.getElementById('wrapper');
      return s && w
        ? { sidebar: Math.round(s.getBoundingClientRect().height), wrapper: Math.round(w.getBoundingClientRect().height) }
        : null;
    });
    const pdf = await page.pdf({
      width: `${PDF_PAGE_WIDTH_PX}px`,
      height: `${contentHeight}px`,
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });
    return { contentHeight, sidebar, buf: Buffer.from(pdf) };
  } finally { await page.close(); }
}

let failed = 0;
const check = (name, ok, detail = '') => {
  if (ok) console.log(`  ok    ${name}${detail ? '  ' + detail : ''}`);
  else { failed++; console.log(`  FAIL  ${name}  ${detail}`); }
};

(async () => {
  const A4_H_PT = 842, A4_W_PT = 595;
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });

  try {
    // The root cause, pinned so it cannot silently come back.
    console.log('=== document mode ===');
    {
      const page = await browser.newPage();
      await page.setContent(cv(1), { waitUntil: 'load' });
      const before = await page.evaluate(() => document.compatMode);
      await page.setContent(withDoctype(cv(1)), { waitUntil: 'load' });
      const after = await page.evaluate(() => document.compatMode);
      await page.close();
      check('model HTML alone lands in quirks mode', before === 'BackCompat', `(${before})`);
      check('withDoctype puts it in standards mode', after === 'CSS1Compat', `(${after})`);
    }

    for (const [label, entries] of [['SHORT CV (~1/3 page)', 1], ['LONG CV (~2.5 pages)', 22]]) {
      console.log(`\n=== ${label} ===`);
      const html = cv(entries);

      const before = geometry((await render(browser, html, { legacy: true })).buf);
      const { contentHeight, sidebar, buf } = await render(browser, html);
      const after = geometry(buf);
      const box = after.boxes[0];

      console.log(`  content height measured : ${contentHeight}px`);
      console.log(`  BEFORE (fixed A4)       : ${before.pages} page(s), ${before.boxes[0].w.toFixed(0)}×${before.boxes[0].h.toFixed(0)}pt`);
      console.log(`  AFTER  (content-sized)  : ${after.pages} page(s), ${box.w.toFixed(0)}×${box.h.toFixed(0)}pt`);

      check('width still A4 (595pt)', Math.abs(box.w - A4_W_PT) <= 2, `(${box.w.toFixed(1)}pt)`);
      check('height equals the measured content',
        Math.abs(box.h - contentHeight * PX_PER_PT) <= 2,
        `(${box.h.toFixed(1)}pt vs ${(contentHeight * PX_PER_PT).toFixed(1)}pt)`);
      check('exactly one page, no trailing blank sheet', after.pages === 1, `(got ${after.pages})`);

      // The min-height override must not leave the coloured sidebar floating
      // above white space — flex stretch has to keep it the full page height.
      check('sidebar still spans the whole page',
        sidebar && Math.abs(sidebar.sidebar - sidebar.wrapper) <= 1,
        sidebar ? `(sidebar ${sidebar.sidebar}px vs wrapper ${sidebar.wrapper}px)` : '(not found)');

      if (entries === 1) {
        const removed = A4_H_PT - box.h;
        check('the blank space is gone', box.h < A4_H_PT * 0.5,
          `(removed ${removed.toFixed(0)}pt ≈ ${(removed / A4_H_PT * 100).toFixed(0)}% of an A4 sheet)`);
      } else {
        check('long CV not truncated', box.h > A4_H_PT * 2,
          `(${(box.h / A4_H_PT).toFixed(2)}× A4, one continuous page)`);
        check('old behaviour paginated it', before.pages >= 3, `(was ${before.pages} pages)`);
      }
    }
  } finally { await browser.close(); }

  console.log(`\n${failed === 0 ? 'ALL CHECKS PASSED' : failed + ' CHECK(S) FAILED'}`);
  process.exitCode = failed === 0 ? 0 : 1;
})().catch((e) => { console.error('ERROR:', e.message); process.exitCode = 1; });
