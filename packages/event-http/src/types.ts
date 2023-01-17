import { IncomingMessage, ServerResponse } from 'http'
import { TGenericEvent, TGenericContextStore } from '@wooksjs/event-core'
import { TTimeMultiString } from './utils/time'
import { EHttpStatusCode } from './utils/status-codes'
import { WooksURLSearchParams } from './utils/url-search-params'

export interface THttpEventData {
    req: IncomingMessage
    res: ServerResponse
}

export interface THttpEvent extends TGenericEvent, THttpEventData {
    type: 'HTTP'
}

export interface THttpContextStore extends TGenericContextStore<THttpEvent> {
    searchParams?: TSearchParamsCache
    cookies?: { [name: string]: string | null }
    setCookies?: { [name: string]: TSetCookieData }
    accept?: { [name: string]: boolean }
    authorization?: TAuthCache
    setHeader?: { [name: string]: string | string[] }
    request?: TRequestCache
    response?: { responded: boolean }
    status?: { code: EHttpStatusCode }
}

export type TSetCookieData = { value: string, attrs: TCookieAttributesInput }

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

export type TAuthCache = {
    type: string | null
    credentials: string | null
    basicCredentials: { username: string, password: string } | null
}

export type TRequestCache = {
    rawBody: Promise<Buffer>
    parsed: unknown
    forwardedIp?: string
    remoteIp?: string
    ipList?: { remoteIp: string, forwarded: string[] }
}

export type TSearchParamsCache = {
    raw?: string
    urlSearchParams?: WooksURLSearchParams
}
