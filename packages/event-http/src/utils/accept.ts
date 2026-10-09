/** Short Accept names mapped to their MIME types. */
export const ACCEPT_TYPE_MAP: Record<string, string> = {
  json: 'application/json',
  html: 'text/html',
  xml: 'application/xml',
  text: 'text/plain',
}

/** Whether an `Accept` header value accepts `type` (a short name from {@link ACCEPT_TYPE_MAP} or a MIME type). */
export function acceptHeaderHas(accept: string | undefined, type: string): boolean {
  return !!(accept && (accept === '*/*' || accept.includes(ACCEPT_TYPE_MAP[type] || type)))
}
