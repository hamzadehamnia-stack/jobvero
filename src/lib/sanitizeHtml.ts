'use client';

import DOMPurify from 'dompurify';

// ─── Shared HTML sanitization ─────────────────────────────────────────────────
//
// Every dangerouslySetInnerHTML sink in the app renders HTML that originates
// outside our control:
//
//   - inbox message bodies      → written by whoever emailed the user
//   - CVs and cover letters     → written by an LLM, from a prompt that embeds
//                                 the job description and the user's parsed CV
//
// The second case is the non-obvious one. The models are asked to return raw
// HTML, and their input includes attacker-reachable text: a job description
// fetched from Adzuna / JSearch / France Travail, or a CV uploaded through
// /api/parse-cv. A prompt injection carried in that text can steer the model
// into emitting `<img src=x onerror=...>`, which then renders inside the user's
// authenticated dashboard. So LLM output is untrusted input, not our own markup.
//
// Two profiles, because the two cases need different tag sets. Both strip
// <script>, event-handler attributes and javascript: URLs.

const GOOGLE_FONTS_PREFIX = 'https://fonts.googleapis.com/';

// DOMPurify hooks are global to the module instance, so register them exactly
// once and make each branch check the tag it cares about.
let hooksRegistered = false;

function registerHooks(): void {
  if (hooksRegistered || typeof window === 'undefined') return;
  hooksRegistered = true;

  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    const el = node as Element;

    // Links open in a new tab without handing the opener over.
    if (el.tagName === 'A') {
      el.setAttribute('target', '_blank');
      el.setAttribute('rel', 'noopener noreferrer');
    }

    // <link> is allowed only to pull Google Fonts stylesheets. Anything else --
    // a foreign stylesheet used for CSS-based exfiltration, a preload, an
    // alternate -- is dropped. CSP style-src blocks these too; this is the
    // second layer, in case the policy is ever loosened.
    if (el.tagName === 'LINK') {
      const rel  = (el.getAttribute('rel') ?? '').toLowerCase();
      const href = el.getAttribute('href') ?? '';
      if (rel !== 'stylesheet' || !href.startsWith(GOOGLE_FONTS_PREFIX)) {
        el.parentNode?.removeChild(el);
      }
    }
  });
}

// ─── Profile 1: inbound email ────────────────────────────────────────────────

const EMAIL_SANITIZE_CONFIG = {
  // Whitelist of tags normal in email HTML — anything else is stripped
  ALLOWED_TAGS: [
    'p', 'br', 'div', 'span', 'strong', 'b', 'em', 'i', 'u', 's', 'strike',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'hr',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
    'a', 'img',
  ],
  // Whitelist of attributes — event handlers (onerror, onclick…) are not listed, so stripped
  ALLOWED_ATTR: [
    'href', 'src', 'alt', 'title', 'width', 'height', 'style', 'class',
    'colspan', 'rowspan', 'align', 'valign', 'border', 'cellpadding', 'cellspacing',
    'target', 'rel',
  ],
  ALLOW_DATA_ATTR: false,
  FORCE_BODY: true,
  // DOMPurify blocks javascript: URLs in href/src by default
};

// ─── Profile 2: generated documents (CV, cover letter) ───────────────────────
//
// Wider than the email profile because these are full page-layout documents:
// the prompts ask for inline styles, semantic headings and ATS section ids.
// Deliberately absent: script, style, iframe, object, embed, form, input,
// button, base, meta — none appear in a CV, and each is an execution or
// exfiltration primitive.

const DOCUMENT_SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    'div', 'span', 'p', 'br', 'hr', 'section', 'article', 'header', 'footer', 'main', 'aside', 'nav',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'strong', 'b', 'em', 'i', 'u', 's', 'small', 'sub', 'sup', 'mark', 'abbr', 'cite', 'q',
    'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'blockquote', 'pre', 'code',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
    'a', 'img', 'link',
  ],
  ALLOWED_ATTR: [
    // `id` is kept on purpose: the US resume prompt emits id="summary",
    // id="experience" etc. as ATS section anchors.
    'style', 'class', 'id', 'href', 'src', 'alt', 'title', 'width', 'height',
    'colspan', 'rowspan', 'align', 'valign', 'border', 'cellpadding', 'cellspacing',
    'target', 'rel', 'type', 'dir', 'lang',
  ],
  ALLOW_DATA_ATTR: false,
  FORCE_BODY: true,
};

// ─── Public API ───────────────────────────────────────────────────────────────
//
// Both return '' when there is no DOM (server render). Every caller renders
// content that only exists after a client-side fetch or a user action, so this
// does not blank out any server-rendered markup.

export function sanitizeEmailHtml(html: string): string {
  if (typeof window === 'undefined') return '';
  registerHooks();
  return String(DOMPurify.sanitize(html, EMAIL_SANITIZE_CONFIG));
}

export function sanitizeDocumentHtml(html: string | null | undefined): string {
  if (typeof window === 'undefined' || !html) return '';
  registerHooks();
  return String(DOMPurify.sanitize(html, DOCUMENT_SANITIZE_CONFIG));
}
