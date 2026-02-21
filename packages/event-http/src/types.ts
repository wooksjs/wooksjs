import type { IncomingMessage, ServerResponse } from 'http'

import type { EHttpStatusCode } from './utils/status-codes'
import type { TTimeMultiString } from './utils/time'
import type { WooksURLSearchParams } from './utils/url-search-params'

export interface THttpEventData {
  req: IncomingMessage
  res: ServerResponse
  requestLimits?: TRequestLimits
}

export interface THttpEvent {
  type: 'HTTP'
}

export interface THttpContextStore {
  searchParams?: TSearchParamsCache
  cookies?: Record<string, string | null>
  setCookies?: Record<string, TSetCookieData>
  accept?: Record<string, boolean>
  authorization?: TAuthCache
  setHeader?: Record<string, string | string[]>
  request?: TRequestCache
  response?: { responded: boolean }
  status?: { code: EHttpStatusCode }
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

export interface TAuthCache {
  type: string | null
  credentials: string | null
  basicCredentials: { username: string; password: string } | null
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

export interface TRequestCache {
  rawBody: Promise<Buffer>
  parsed: unknown
  forwardedIp?: string
  remoteIp?: string
  ipList?: { remoteIp: string; forwarded: string[] }
  contentEncodings?: string[]
  isCompressed?: boolean
}

export interface TSearchParamsCache {
  raw?: string
  urlSearchParams?: WooksURLSearchParams
}
