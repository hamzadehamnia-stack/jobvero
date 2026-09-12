// Regression test for src/lib/pdfPageSize.ts + src/lib/htmlToPdfBuffer.ts
//
// Run it:  node security-tests/pdfPageSize.test.js
//
// The export has two modes:
//   content fits on one A4 sheet -> page sized to the content (no blank space)
//   content is taller than that  -> real A4 pagination, so it still prints
//
// Renders through the same sequence as the library and reads the geometry back
// out of the produced PDF bytes (/MediaBox), rather than trusting the options
// that were passed in.
//
// Mirrors measureContentHeight / markAtomicBlocks / withDoctype / the injected
// CSS from those files (TypeScript, @/ alias). KEEP IN SYNC.

const puppeteer = require('puppeteer');

const PDF_PAGE_WIDTH_PX  = 794;      // A4 width at 96dpi === 595pt. NOT 595px.
const A4_PAGE_HEIGHT_PX  = 1123;
const PX_PER_PT = 72 / 96;
const A4_W_PT = 595, A4_H_PT = 842;

const withDoctype = (html) =>
  /^\s*<!doctype/i.test(html) ? html : `<!DOCTYPE html>\n${html}`;

const PAGE_BREAK_CSS = `
  h1, h2, h3, h4, h5, h6 { break-after: avoid; page-break-after: avoid; }
  li, tr, img, svg, figure, table { break-inside: avoid; page-break-inside: avoid; }
  p { orphans: 3; widows: 3; }
  [data-pdf-atomic] { break-inside: avoid; page-break-inside: avoid; }
`;

const PDF_CSS = `
  @page { margin: 0; }
  html, body { margin: 0; padding: 0; }
  body, body * { min-height: 0 !important; }
  ${PAGE_BREAK_CSS}
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
  return height > 0 ? height : A4_PAGE_HEIGHT_PX;
}

const OVERFLOW_TOLERANCE = 0.08;

function choosePageStrategy(contentHeightPx) {
  if (contentHeightPx <= A4_PAGE_HEIGHT_PX) {
    return { mode: 'fitted', heightPx: contentHeightPx };
  }
  const naturalPages = Math.ceil(contentHeightPx / A4_PAGE_HEIGHT_PX);
  const tighterPages = naturalPages - 1;
  const spillover    = contentHeightPx - tighterPages * A4_PAGE_HEIGHT_PX;
  if (tighterPages >= 1 && spillover <= A4_PAGE_HEIGHT_PX * OVERFLOW_TOLERANCE) {
    return {
      mode: 'paginated',
      pages: tighterPages,
      scale: (tighterPages * A4_PAGE_HEIGHT_PX) / contentHeightPx,
    };
  }
  return { mode: 'paginated', pages: naturalPages, scale: 1 };
}

async function markAtomicBlocks(page) {
  await page.evaluate(() => {
    const MAX_ATOMIC_HEIGHT_PX = 260;
    const blocks = document.body?.querySelectorAll('div, section, article, li, tr');
    if (!blocks) return;
    for (const el of Array.from(blocks)) {
      const h = el.getBoundingClientRect().height;
      if (h > 0 && h <= MAX_ATOMIC_HEIGHT_PX) el.setAttribute('data-pdf-atomic', '');
    }
  });
}

// A CV shaped like the real templates: raw HTML with no doctype (the model is
// told to start at the fonts <link>), a flex wrapper pinned to a full sheet via
// min-height, and a sidebar that relies on flex stretch for its height.
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

// ─── Cover letters ────────────────────────────────────────────────────────────
//
// A different shape from a CV: no sidebar, no min-height pin, just a business
// letter. Built to the spec the generate-cover-letter prompt gives the model —
// Helvetica Neue, padding 40px 48px, sender top-right, date, recipient block,
// salutation, body, closing, signature, 13px/1.7 in #1a1a2e.

const LETTER_PARA = `I have followed your work on developer tooling for several years, and the
role you advertised reads like the job I have been growing into. At ACME I led the
platform team through a migration to a service architecture, cut p95 latency by
forty percent, and took the on-call rotation from a rota nobody wanted to one the
team volunteers for. The billing rewrite I shipped now processes two million events
a day without an incident.`;

function letter(paragraphs, extraLines = 0) {
  const body = Array.from({ length: paragraphs }, () =>
    `<p style="margin-bottom:16px">${LETTER_PARA}</p>`).join('');
  // Short lines give finer granularity than a whole paragraph, so a letter can
  // be landed inside the 8% tolerance band for testing.
  const extra = Array.from({ length: extraLines }, (_, i) =>
    `<p style="margin-bottom:0">Enclosure ${i + 1}: portfolio and references available on request.</p>`).join('');
  return `<div style="font-family:'Helvetica Neue',Arial,sans-serif;background:#fff;padding:40px 48px;font-size:13px;line-height:1.7;color:#1a1a2e;">
  <div style="text-align:right;margin-bottom:24px">
    <div style="font-weight:600">Jane Doe</div><div>jane.doe@example.com</div>
  </div>
  <div style="margin-bottom:24px">12 September 2026</div>
  <div style="margin-bottom:28px"><div style="font-weight:600">Hiring Team</div><div>ACME Technologies</div><div>Paris, France</div></div>
  <p style="margin-bottom:16px">Dear Hiring Team,</p>
  ${body}${extra}
  <p style="margin-bottom:8px">Kind regards,</p>
  <p style="font-weight:600">Jane Doe</p>
</div>`;
}

// Byte-for-byte the wrapper /api/generate-pdf builds, so the letter path is
// exercised as the route actually renders it rather than approximated.
const routeWrapper = (html) => `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${PDF_PAGE_WIDTH_PX}px; background: #fff; }
  @page { margin: 0; }
  body, body * { min-height: 0 !important; }
  ${PAGE_BREAK_CSS}
</style>
</head>
<body>${html}</body>
</html>`;

async function renderLetter(browser, html) {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: PDF_PAGE_WIDTH_PX, height: A4_PAGE_HEIGHT_PX });
    await page.setContent(routeWrapper(html), { waitUntil: 'load' });
    await new Promise((r) => setTimeout(r, 300));

    const contentHeight = await measureContentHeight(page);
    const strategy = choosePageStrategy(contentHeight);
    const margin = { top: '0', right: '0', bottom: '0', left: '0' };

    let pdf;
    if (strategy.mode === 'fitted') {
      pdf = await page.pdf({
        width: `${PDF_PAGE_WIDTH_PX}px`, height: `${strategy.heightPx}px`,
        printBackground: true, margin,
      });
    } else {
      await markAtomicBlocks(page);
      pdf = await page.pdf({ format: 'A4', printBackground: true, scale: strategy.scale, margin });
    }
    return { contentHeight, strategy, buf: Buffer.from(pdf) };
  } finally { await page.close(); }
}

function geometry(buf) {
  const s = buf.toString('latin1');
  const boxes = [...s.matchAll(/\/MediaBox\s*\[\s*([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s*\]/g)]
    .map((m) => ({ w: parseFloat(m[3]) - parseFloat(m[1]), h: parseFloat(m[4]) - parseFloat(m[2]) }));
  return { boxes, pages: (s.match(/\/Type\s*\/Page[^s]/g) || []).length };
}

async function render(browser, html) {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: PDF_PAGE_WIDTH_PX, height: A4_PAGE_HEIGHT_PX });
    await page.setContent(withDoctype(html), { waitUntil: 'load' });
    await new Promise((r) => setTimeout(r, 300));
    await page.addStyleTag({ content: PDF_CSS });

    const contentHeight = await measureContentHeight(page);
    const margin = { top: '0', right: '0', bottom: '0', left: '0' };
    const strategy = choosePageStrategy(contentHeight);
    const paginated = strategy.mode === 'paginated';

    const sidebar = await page.evaluate(() => {
      const s = document.getElementById('sidebar');
      const w = document.getElementById('wrapper');
      return s && w
        ? { sidebar: Math.round(s.getBoundingClientRect().height), wrapper: Math.round(w.getBoundingClientRect().height) }
        : null;
    });

    let pdf;
    if (!paginated) {
      pdf = await page.pdf({
        width: `${PDF_PAGE_WIDTH_PX}px`, height: `${strategy.heightPx}px`,
        printBackground: true, margin,
      });
      return { contentHeight, strategy, paginated, sidebar, atomic: 0, buf: Buffer.from(pdf) };
    }
    await markAtomicBlocks(page);
    const atomic = await page.evaluate(() => document.querySelectorAll('[data-pdf-atomic]').length);
    pdf = await page.pdf({ format: 'A4', printBackground: true, scale: strategy.scale, margin });
    return { contentHeight, strategy, paginated, sidebar, atomic, buf: Buffer.from(pdf) };
  } finally { await page.close(); }
}

let failed = 0;
const check = (name, ok, detail = '') => {
  if (ok) console.log(`  ok    ${name}${detail ? '  ' + detail : ''}`);
  else { failed++; console.log(`  FAIL  ${name}  ${detail}`); }
};

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });

  try {
    // Pure logic, no browser — so the tolerance boundaries are pinned exactly
    // rather than depending on how a sample document happens to render.
    console.log('=== page strategy across the thresholds ===');
    {
      const A4 = A4_PAGE_HEIGHT_PX;
      const rows = [
        ['well under one page',        500,               'fitted',    1, 1],
        ['exactly one page',           A4,                'fitted',    1, 1],
        ['one pixel over',             A4 + 1,            'paginated', 1, 0.999],
        ['4% over  (the reported case)', 1170,            'paginated', 1, 0.960],
        ['8% over  (tolerance edge)',   Math.floor(A4 * 1.08), 'paginated', 1, 0.926],
        ['9% over  (past tolerance)',   Math.ceil(A4 * 1.09),  'paginated', 2, 1],
        ['exactly two pages',           A4 * 2,           'paginated', 2, 1],
        ['2 pages + 5%',                Math.floor(A4 * 2.05), 'paginated', 2, 0.976],
        ['2 pages + 30%',               Math.floor(A4 * 2.30), 'paginated', 3, 1],
      ];
      for (const [label, h, mode, pages, scale] of rows) {
        const s = choosePageStrategy(h);
        const gotPages = s.mode === 'fitted' ? 1 : s.pages;
        const gotScale = s.mode === 'fitted' ? 1 : s.scale;
        check(`${label} (${h}px)`,
          s.mode === mode && gotPages === pages && Math.abs(gotScale - scale) < 0.005,
          `-> ${s.mode}, ${gotPages} page(s), scale ${(gotScale * 100).toFixed(1)}%`);
      }
      check('tolerance never shrinks text below 92%',
        rows.every(([, h]) => {
          const s = choosePageStrategy(h);
          return s.mode === 'fitted' || s.scale >= 0.92;
        }));
    }

    console.log('\n=== document mode (the quirks-mode root cause) ===');
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

    // Entry counts chosen to land one case either side of the A4 threshold and
    // one comfortably beyond it.
    const cases = [
      { label: 'SHORT CV (~1/3 page)',        entries: 1,  mode: 'fitted'    },
      { label: 'CV FILLING ~1 PAGE',          entries: 8,  mode: 'fitted'    },
      { label: 'CV JUST OVER 1 PAGE',         entries: 9,  mode: 'paginated', pages: 1 },
      { label: 'LONG CV (2-3 pages)',         entries: 22, mode: 'paginated', pages: 3 },
    ];

    for (const { label, entries, mode, pages: expectPages } of cases) {
      console.log(`\n=== ${label} ===`);
      const { contentHeight, strategy, paginated, sidebar, atomic, buf } = await render(browser, cv(entries));
      const g = geometry(buf);
      const box = g.boxes[0];

      console.log(`  content height : ${contentHeight}px  (A4 = ${A4_PAGE_HEIGHT_PX}px)`);
      console.log(`  mode           : ${paginated ? `A4 pagination, scale ${(strategy.scale * 100).toFixed(1)}%` : 'fitted to content'}`);
      console.log(`  result         : ${g.pages} page(s), ${box.w.toFixed(0)}×${box.h.toFixed(0)}pt`);
      if (paginated) console.log(`  atomic blocks  : ${atomic}`);

      check(`took the ${mode} branch`, paginated === (mode === 'paginated'));
      check('width is A4 (595pt)', Math.abs(box.w - A4_W_PT) <= 2, `(${box.w.toFixed(1)}pt)`);
      check('sidebar spans the full wrapper',
        sidebar && Math.abs(sidebar.sidebar - sidebar.wrapper) <= 1,
        sidebar ? `(${sidebar.sidebar}px vs ${sidebar.wrapper}px)` : '(not found)');

      if (mode === 'fitted') {
        check('exactly one page', g.pages === 1, `(got ${g.pages})`);
        check('height equals the measured content',
          Math.abs(box.h - contentHeight * PX_PER_PT) <= 2,
          `(${box.h.toFixed(1)}pt vs ${(contentHeight * PX_PER_PT).toFixed(1)}pt)`);
        check('never taller than an A4 sheet', box.h <= A4_H_PT + 1, `(${box.h.toFixed(1)}pt)`);
        if (entries === 1) {
          const removed = A4_H_PT - box.h;
          check('blank space removed', box.h < A4_H_PT * 0.5,
            `(${removed.toFixed(0)}pt ≈ ${(removed / A4_H_PT * 100).toFixed(0)}% of a sheet)`);
        }
      } else {
        check('EVERY page is a true A4 sheet',
          g.boxes.every((b) => Math.abs(b.w - A4_W_PT) <= 2 && Math.abs(b.h - A4_H_PT) <= 2),
          `(${g.boxes.map((b) => `${b.w.toFixed(0)}×${b.h.toFixed(0)}`).join(', ')})`);
        check('page count is the one the strategy asked for',
          g.pages === strategy.pages, `(${g.pages} vs ${strategy.pages})`);
        check(`lands on ${expectPages} sheet(s) as intended`,
          g.pages === expectPages, `(got ${g.pages})`);
        check('scale never shrinks text below 92%', strategy.scale >= 0.92,
          `(${(strategy.scale * 100).toFixed(1)}%)`);
        check('job entries marked unbreakable', atomic > 0, `(${atomic} blocks)`);
      }
    }
    // ── Cover letters ───────────────────────────────────────────────────────
    // /api/generate-pdf serves letters as well as saved CVs, and a letter has
    // none of a CV's structure — so the three bands are re-checked on that
    // shape rather than assumed to carry over.
    console.log('\n\n########  COVER LETTERS  ########');

    const letterCases = [
      { label: 'REAL LETTER (3 paragraphs, the prompt spec)', paras: 3,  lines: 0, mode: 'fitted',    pages: 1 },
      { label: 'LETTER FILLING ~1 PAGE',                      paras: 7,  lines: 0, mode: 'fitted',    pages: 1 },
      { label: 'LETTER JUST OVER 1 PAGE (tolerance band)',    paras: 7,  lines: 2, mode: 'paginated', pages: 1 },
      { label: 'LONG LETTER (2 pages)',                       paras: 12, lines: 0, mode: 'paginated', pages: 2 },
    ];

    for (const { label, paras, lines, mode, pages: expectPages } of letterCases) {
      console.log(`\n=== ${label} ===`);
      const { contentHeight, strategy, buf } = await renderLetter(browser, letter(paras, lines));
      const g = geometry(buf);
      const box = g.boxes[0];
      const overflowPct = ((contentHeight - A4_PAGE_HEIGHT_PX) / A4_PAGE_HEIGHT_PX * 100);

      console.log(`  content height : ${contentHeight}px  (${contentHeight <= A4_PAGE_HEIGHT_PX
        ? `${(contentHeight / A4_PAGE_HEIGHT_PX * 100).toFixed(0)}% of a sheet`
        : `+${overflowPct.toFixed(1)}% over one sheet`})`);
      console.log(`  mode           : ${strategy.mode === 'fitted'
        ? 'fitted to content'
        : `A4 pagination, scale ${(strategy.scale * 100).toFixed(1)}%`}`);
      console.log(`  result         : ${g.pages} page(s), ${box.w.toFixed(0)}×${box.h.toFixed(0)}pt`);

      check(`took the ${mode} branch`, strategy.mode === mode, `(${strategy.mode})`);
      check(`lands on ${expectPages} sheet(s)`, g.pages === expectPages, `(got ${g.pages})`);
      check('width is A4 (595pt)', Math.abs(box.w - A4_W_PT) <= 2, `(${box.w.toFixed(1)}pt)`);

      if (mode === 'fitted') {
        check('height equals the measured content',
          Math.abs(box.h - contentHeight * PX_PER_PT) <= 2,
          `(${box.h.toFixed(1)}pt vs ${(contentHeight * PX_PER_PT).toFixed(1)}pt)`);
        check('no blank tail below the signature', box.h <= A4_H_PT + 1, `(${box.h.toFixed(1)}pt)`);
      } else {
        check('EVERY page is a true A4 sheet',
          g.boxes.every((b) => Math.abs(b.w - A4_W_PT) <= 2 && Math.abs(b.h - A4_H_PT) <= 2),
          `(${g.boxes.map((b) => `${b.w.toFixed(0)}×${b.h.toFixed(0)}`).join(', ')})`);
        check('scale stays above 92%', strategy.scale >= 0.92, `(${(strategy.scale * 100).toFixed(1)}%)`);
      }

      // The band the case is meant to exercise, asserted explicitly so a
      // rendering shift that moves a letter into a different band is caught
      // rather than silently passing under the wrong branch.
      if (label.includes('tolerance band')) {
        check('overflow really is inside the 8% tolerance',
          overflowPct > 0 && overflowPct <= 8, `(+${overflowPct.toFixed(1)}%)`);
        check('absorbed onto a single sheet instead of spilling', g.pages === 1);
      }
    }
  } finally { await browser.close(); }

  console.log(`\n${failed === 0 ? 'ALL CHECKS PASSED' : failed + ' CHECK(S) FAILED'}`);
  process.exitCode = failed === 0 ? 0 : 1;
})().catch((e) => { console.error('ERROR:', e.message); process.exitCode = 1; });
