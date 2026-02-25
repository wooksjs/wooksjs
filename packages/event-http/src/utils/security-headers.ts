/**
 * Configuration for `securityHeaders()`. Each option accepts a `string` (override value),
 * `false` (disable), or `undefined` (use default). `strictTransportSecurity` has no default (opt-in only).
 */
export interface SecurityHeadersOptions {
  /** `Content-Security-Policy` header. Default: `"default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'"`. */
  contentSecurityPolicy?: string | false
  /** `Cross-Origin-Opener-Policy` header. Default: `'same-origin'`. */
  crossOriginOpenerPolicy?: string | false
  /** `Cross-Origin-Resource-Policy` header. Default: `'same-origin'`. */
  crossOriginResourcePolicy?: string | false
  /** `Referrer-Policy` header. Default: `'no-referrer'`. */
  referrerPolicy?: string | false
  /** `Strict-Transport-Security` header. No default (opt-in only — HSTS is dangerous if not on HTTPS). */
  strictTransportSecurity?: string | false
  /** `X-Content-Type-Options` header. Default: `'nosniff'`. */
  xContentTypeOptions?: string | false
  /** `X-Frame-Options` header. Default: `'SAMEORIGIN'`. */
  xFrameOptions?: string | false
}

const HEADER_MAP: [keyof SecurityHeadersOptions, string, string | undefined][] = [
  [
    'contentSecurityPolicy',
    'content-security-policy',
    "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'",
  ],
  ['crossOriginOpenerPolicy', 'cross-origin-opener-policy', 'same-origin'],
  ['crossOriginResourcePolicy', 'cross-origin-resource-policy', 'same-origin'],
  ['referrerPolicy', 'referrer-policy', 'no-referrer'],
  ['strictTransportSecurity', 'strict-transport-security', undefined],
  ['xContentTypeOptions', 'x-content-type-options', 'nosniff'],
  ['xFrameOptions', 'x-frame-options', 'SAMEORIGIN'],
]

/**
 * Returns a record of recommended HTTP security headers.
 *
 * Each option accepts a `string` (override value) or `false` (disable).
 * Omitting an option uses the default value.
 *
 * `strictTransportSecurity` is opt-in only (no default) — HSTS is dangerous if not on HTTPS.
 */
export function securityHeaders(opts?: SecurityHeadersOptions): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [optKey, headerName, defaultValue] of HEADER_MAP) {
    const value = opts?.[optKey]
    if (value === false) continue
    if (typeof value === 'string') {
      result[headerName] = value
    } else if (defaultValue !== undefined) {
      result[headerName] = defaultValue
    }
  }
  return result
}
