// Escape a string for interpolation into an HTML template literal.
//
// For server-side email bodies. The client-side CV templates have their own
// `esc` in components/cv-builder/templates.ts; this is the equivalent for the
// API routes that build notification emails by string concatenation.
//
// Escapes the five characters that can break out of either element content or
// a double/single-quoted attribute value.
export function escapeHtml(value: string | null | undefined): string {
  return (value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
