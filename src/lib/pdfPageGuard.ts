// Network allowlist for headless-Chromium PDF rendering.
//
// Both PDF paths take an HTML string from the request body and render it in a
// headless browser. That browser makes real network requests for whatever the
// document references, from inside the deployment — so the HTML is an SSRF
// primitive, and the rendered PDF is handed straight back to the caller:
//
//     <iframe src="http://169.254.169.254/latest/meta-data/" width="800" height="1000">
//
// would render the cloud metadata response into the PDF the attacker receives.
// Any authenticated user can call these routes, and the browser is launched
// with --no-sandbox.
//
// What legitimate documents actually need is narrow: the CV and cover-letter
// prompts produce inline styles plus a Google Fonts <link>, and the CV
// templates in components/cv-builder/templates.ts contain no <img> at all. So
// the allowlist is data: URIs and the two Google Fonts origins; everything else
// is aborted before a connection is made.

const ALLOWED_PREFIXES = [
  'https://fonts.googleapis.com/',
  'https://fonts.gstatic.com/',
];

// Structural types so this works with both puppeteer and puppeteer-core.
interface InterceptedRequest {
  url(): string;
  isNavigationRequest(): boolean;
  frame(): unknown;
  continue(): Promise<void>;
  abort(): Promise<void>;
}

interface InterceptablePage {
  setRequestInterception(value: boolean): Promise<void>;
  mainFrame(): unknown;
  on(event: 'request', handler: (request: InterceptedRequest) => void): unknown;
}

export async function applyPdfNetworkAllowlist(page: InterceptablePage): Promise<void> {
  await page.setRequestInterception(true);

  const mainFrame = page.mainFrame();

  page.on('request', (request) => {
    const url = request.url();

    // isNavigationRequest() alone is NOT enough, and this is the part that is
    // easy to get wrong: it is also true for an <iframe> loading its own src.
    // Allowing every navigation therefore lets <iframe src="http://internal/">
    // straight through — verified: a guard written that way still reached a
    // local test service. Only the main frame's own navigation (about:blank,
    // driven by setContent) is permitted.
    const isMainFrameNavigation =
      request.isNavigationRequest() && request.frame() === mainFrame;

    const allowed =
      isMainFrameNavigation ||
      url.startsWith('data:') ||
      url === 'about:blank' ||
      ALLOWED_PREFIXES.some((prefix) => url.startsWith(prefix));

    // continue()/abort() reject if the request was already handled or the page
    // is closing; that is not actionable here.
    const settle = allowed ? request.continue() : request.abort();
    void settle.catch(() => undefined);
  });
}
