import type { IncomingMessage, ServerResponse } from 'http'

import type { TTimeMultiString } from './utils/time'

/** Raw HTTP event data attached to the event context. */
export interface THttpEventData {
  req: IncomingMessage
  res: ServerResponse
  requestLimits?: TRequestLimits
}

/** Data for a pending outgoing `Set-Cookie` header (name is stored as the key in `HttpResponse._cookies`). */
export interface TSetCookieData {
  value: string
  attrs: TCookieAttributesInput
}

/** Partial cookie attributes — all fields are optional. */
export type TCookieAttributesInput = Partial<TCookieAttributes>

/** Full set of attributes for a `Set-Cookie` header (RFC 6265 §4.1). */
export interface TCookieAttributes {
  /** Cookie expiration date: a `Date`, a date string, or a timestamp in **milliseconds**. */
  expires: Date | string | number
  /**
   * `Max-Age`: a number is **seconds** (`86400` = one day); a string carries its units
   * (`'1d'`, `'15m'`, `'1.5h'`). Rendered as whole seconds, rounded down, clamped to
   * 0–2147483648; `0` or a negative number renders `Max-Age=0` (expires the cookie).
   */
  maxAge: number | TTimeMultiString
  /** Cookie domain. */
  domain: string
  /** Cookie path. */
  path: string
  /** Secure flag — cookie only sent over HTTPS. */
  secure: boolean
  /** HttpOnly flag — cookie not accessible via JavaScript. */
  httpOnly: boolean
  /** SameSite policy. */
  sameSite: boolean | 'Lax' | 'None' | 'Strict'
}

/** App-level request body limits (all optional, defaults apply when omitted). */
export interface TRequestLimits {
  /** Max compressed body size in bytes (default: 1 MB). */
  maxCompressed?: number
  /** Max inflated (decompressed) body size in bytes (default: 10 MB). */
  maxInflated?: number
  /** Max compression ratio, e.g. 100 means 100× expansion (default: 100). */
  maxRatio?: number
  /** Body read timeout in milliseconds (default: 10 000). */
  readTimeoutMs?: number
  /** Internal flag: true when this object is a per-request clone (copy-on-write). */
  perRequest?: boolean
}
