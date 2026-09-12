// Page sizing for the Puppeteer PDF paths.
//
// Both CV/letter exports used to render onto a fixed A4 page, so a CV that
// filled a third of the sheet produced a PDF with two thirds of blank paper
// under it. The page is now sized to the content instead.
//
// Width stays fixed at the A4 width the templates are laid out against; only
// the height follows the content.

/**
 * A4 width at 96 dpi, in CSS pixels — the width every template lays out
 * against (`html, body { width: 794px }`, viewport 794).
 *
 * Do not "simplify" this to 595. That is A4's width in POINTS; Puppeteer's
 * `width` option in px means CSS pixels, so 595px would be a page ~25%
 * narrower than the content and the CV would be cut off down the right edge.
 * 794px === 595pt === 210mm.
 */
export const PDF_PAGE_WIDTH_PX = 794;

/** A4 height at 96 dpi, in CSS pixels. The threshold between the two modes. */
export const A4_PAGE_HEIGHT_PX = 1123;

/**
 * Print hygiene for documents that span more than one page.
 *
 * Inert on a single-page export — a fragmentation rule has nothing to act on
 * when there is nothing to fragment — so it is injected unconditionally rather
 * than branching.
 *
 * `[data-pdf-atomic]` is set by markAtomicBlocks() below; the rest is the
 * standard set: never strand a heading at the foot of a page, never split a
 * list item or table row, and never leave one or two orphaned lines of a
 * paragraph behind.
 */
export const PAGE_BREAK_CSS = `
  h1, h2, h3, h4, h5, h6 {
    break-after: avoid;
    page-break-after: avoid;
  }
  li, tr, img, svg, figure, table {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  p { orphans: 3; widows: 3; }
  [data-pdf-atomic] {
    break-inside: avoid;
    page-break-inside: avoid;
  }
`;

// Structural type so this works with both puppeteer and puppeteer-core.
interface MeasurablePage {
  $(selector: string): Promise<{
    boundingBox(): Promise<{ height: number } | null>;
    dispose(): Promise<void>;
  } | null>;
  evaluate<T>(fn: () => T): Promise<T>;
}

/**
 * Height of the rendered content, in CSS pixels, rounded up.
 *
 * Deliberately never reads document.documentElement.scrollHeight or
 * offsetHeight. Both are floored at the viewport height, so on a short CV they
 * report a full 1123px no matter how little is on the page — which silently
 * reinstates exactly the blank space this is meant to remove. That is not a
 * hypothetical: the first version of this function used them and measured a
 * one-third-full CV as a complete A4 sheet.
 *
 * What is measured instead is the real extent of the content: the body's own
 * layout box, its scrollHeight, and the furthest bottom edge among its
 * descendants. The last one is the safety net — the body box under-reports
 * whenever content escapes it (a float, an absolutely positioned block, a
 * template pinning an explicit body height), and under-reporting truncates the
 * CV, which is a worse failure than the blank space.
 */
export async function measureContentHeight(page: MeasurablePage): Promise<number> {
  const measured = await page.evaluate(() => {
    const body = document.body;
    if (!body) return { extent: 0, bodyBox: 0, quirks: false };

    // In quirks mode html and body stretch to the viewport, so the body box
    // reports a full sheet regardless of how little is on it. That box must
    // then be ignored, or a third-full CV measures as a whole A4 page again.
    const quirks = document.compatMode === 'BackCompat';

    const origin = window.scrollY;
    let extent = 0;

    for (const el of Array.from(body.querySelectorAll('*'))) {
      const rect = el.getBoundingClientRect();
      // Skip what is not laid out: a hidden block's rect is all zeros, and a
      // fixed-position element is out of flow and would pin the height to the
      // viewport.
      if (rect.width === 0 && rect.height === 0) continue;
      if (getComputedStyle(el).position === 'fixed') continue;
      extent = Math.max(extent, rect.bottom + origin);
    }

    // Whatever padding the body itself contributes below the last child.
    const style = getComputedStyle(body);
    extent += (parseFloat(style.paddingBottom) || 0) + (parseFloat(style.borderBottomWidth) || 0);

    return {
      extent,
      bodyBox: body.getBoundingClientRect().bottom + origin,
      quirks,
    };
  });

  // The body box is a useful lower bound only in standards mode; see above.
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

  // Chromium rejects a zero-height page; fall back to A4 height if the document
  // measured as empty rather than emitting something unopenable.
  return height > 0 ? height : A4_PAGE_HEIGHT_PX;
}

/**
 * Tag blocks small enough to sit on one page, so a page break never lands in
 * the middle of one.
 *
 * `break-inside: avoid` cannot simply be applied to every div: the outer CV
 * wrapper is a div too, and making the whole document unbreakable would either
 * force it onto one page or drop everything past the first page. So only
 * blocks under a threshold are marked — a job entry, an education line, a
 * skills group.
 *
 * The threshold is deliberately low. An atomic block that does not fit in the
 * space left on a page gets pushed whole to the next one, leaving that gap
 * blank; capping the size caps how much white space a single push can create.
 * At 260px that is at most ~23% of a page, and only on pages where a break
 * actually falls inside a block.
 *
 * Called only when the document is about to be paginated — on a single-page
 * export there are no breaks to protect.
 */
export async function markAtomicBlocks(page: MeasurablePage): Promise<void> {
  await page.evaluate(() => {
    const MAX_ATOMIC_HEIGHT_PX = 260;

    const blocks = document.body?.querySelectorAll('div, section, article, li, tr');
    if (!blocks) return;

    for (const el of Array.from(blocks)) {
      const height = el.getBoundingClientRect().height;
      if (height > 0 && height <= MAX_ATOMIC_HEIGHT_PX) {
        el.setAttribute('data-pdf-atomic', '');
      }
    }
  });
}
