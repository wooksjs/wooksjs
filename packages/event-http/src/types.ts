import type { IncomingMessage, ServerResponse } from 'http'

import type { EHttpStatusCode } from './utils/status-codes'
import type { TTimeMultiString } from './utils/time'
import type { WooksURLSearchParams } from './utils/url-search-params'

export interface THttpEventData {
  req: IncomingMessage
  res: ServerResponse
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

export interface TRequestCache {
  rawBody: Promise<Buffer>
  parsed: unknown
  forwardedIp?: string
  remoteIp?: string
  ipList?: { remoteIp: string; forwarded: string[] }
  contentEncodings?: string[]
  isCompressed?: boolean

  // limits
  maxCompressed?: number
  maxInflated?: number
  maxRatio?: number
  readTimeoutMs?: number
}

export interface TSearchParamsCache {
  raw?: string
  urlSearchParams?: WooksURLSearchParams
}
