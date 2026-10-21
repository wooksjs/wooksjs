/** RFC 9110 `token` (one or more tchar) — e.g. a header or cookie name. */
export const TOKEN_RE = /^[\w!#$%&'*+\-.^`|~]+$/u

export function escapeRegex(s: string): string {
  return s.replace(/[$()*+\-./?[\\\]^{|}]/gu, '\\$&')
}

function safeDecode(f: (s: string) => string, v: string): string {
  try {
    return f(v)
  } catch {
    return v
  }
}

export function safeDecodeURIComponent(uri: string): string {
  if (!uri.includes('%')) {
    return uri
  }
  return safeDecode(decodeURIComponent, uri)
}
