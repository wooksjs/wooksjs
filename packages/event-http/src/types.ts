import type { IncomingMessage, ServerResponse } from 'http'

import type { TTimeMultiString } from './utils/time'

export interface THttpEventData {
  req: IncomingMessage
  res: ServerResponse
  requestLimits?: TRequestLimits
}

export interface TSetCookieData {
  value: string
  attrs: TCookieAttributesInput
}

export type TCookieAttributesInput = Partial<TCookieAttributes>

export interface TCookieAttributes {
  expires: Date | string | number // date
  maxAge: number | TTimeMultiString // seconds
  domain: string
  path: string
  secure: boolean
  httpOnly: boolean
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

