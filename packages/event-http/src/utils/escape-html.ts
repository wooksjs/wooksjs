/**
 * Escapes a value for safe interpolation into HTML text and attribute contexts.
 *
 * Use at the boundary between untrusted data (e.g. attacker-controlled URL
 * parameters, error messages, user input) and rendered HTML responses.
 */
export function escapeHtml(value: unknown): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
