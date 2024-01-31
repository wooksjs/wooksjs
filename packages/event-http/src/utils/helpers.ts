export function escapeRegex(s: string): string {
  return s.replace(/[$()*+./?[\\\]^{|}-]/g, '\\$&')
}

function safeDecode(f: (s: string) => string, v: string): string {
  try {
    return f(v)
  } catch (error) {
    return v
  }
}

export function safeDecodeURIComponent(uri: string): string {
  if (!uri.includes('%')) {
    return uri
  }
  return safeDecode(decodeURIComponent, uri)
}
