import { fetch } from 'node-fetch-native'
import { useHttpContext, useSetHeaders, useStatus } from '@wooksjs/http-event'
import { warn } from 'common/log'
import { applyProxyControls, CookiesIterable, HeadersIterable } from './proxy-utils'
import { TWooksProxyOptions } from './types'

const reqHeadersToBlock = [
    'connection',
    'accept-encoding',
    'content-length',
    'upgrade-insecure-requests',
    'cookie',
]

const resHeadersToBlock = [
    'transfer-encoding',
    'content-encoding',
    'set-cookie',
]

export function useProxy() {
    const status = useStatus()
    const { setHeader, headers: getSetHeaders } = useSetHeaders()
    const { req } = useHttpContext().getCtx().event

    const setHeadersObject = getSetHeaders()

    return async function proxy(target: string, opts?: TWooksProxyOptions): Promise<Response> {
        const targetUrl = new URL(target)
        const path = targetUrl.pathname || '/'
        const url = new URL(path, targetUrl.origin).toString() + (targetUrl.search)

        // preparing request headers and cookies
        const modifiedHeaders = {...req.headers, host: targetUrl.hostname}
        const headers = opts?.reqHeaders ? applyProxyControls(new HeadersIterable(modifiedHeaders), opts?.reqHeaders, reqHeadersToBlock) : {}
        const cookies = opts?.reqCookies && req.headers.cookie ? applyProxyControls(new CookiesIterable(req.headers.cookie), opts?.reqCookies) : null

        if (cookies) {
            headers.cookie = Object.entries(cookies).map(v => v.join('=')).join('; ')
        }
 
        const method = opts?.method || req.method
        
        // actual request
        if (opts?.debug) {
            console.log()
            warn(`[proxy] ${__DYE_GREEN__}${req.method as string} ${req.url as string}${__DYE_YELLOW__} → ${__DYE_CYAN__}${method as string} ${url}${__DYE_YELLOW__}`)
            console.log(__DYE_YELLOW__ + 'headers:', JSON.stringify(headers, null, '  '), __DYE_COLOR_OFF__)
        }
        const resp = await fetch(url, {
            method,
            body: ['GET', 'HEAD'].includes(method as string) ? undefined : req as unknown as BodyInit,
            headers: headers as unknown as HeadersInit,
        })

        // preparing response
        status.value = resp.status

        if (opts?.debug) {
            console.log()
            warn(`[proxy] ${ resp.status } ${__DYE_GREEN__}${req.method as string} ${req.url as string}${__DYE_YELLOW__} → ${__DYE_CYAN__}${method as string} ${url}${__DYE_YELLOW__}`)
            console.log(`${__DYE_YELLOW__}response headers:${__DYE_COLOR_OFF__}`)
        }

        // preparing response headers
        const resHeaders = opts?.resHeaders ? applyProxyControls(resp.headers.entries(), opts?.resHeaders, resHeadersToBlock) : null
        const resCookies = opts?.resCookies ? applyProxyControls(new CookiesIterable(resp.headers.get('set-cookie') || ''), opts?.resCookies) : null

        if (resHeaders) {
            for (const [name, value] of Object.entries(resHeaders)) {
                if (name) {
                    setHeader(name, value)
                    if (opts?.debug) {
                        console.log(`\t${__DYE_YELLOW__}${name}=${__DYE_GREEN__}${value}${__DYE_COLOR_OFF__}`)
                    }
                }
            }
        }

        if (resCookies) {
            setHeadersObject['set-cookie'] = (setHeadersObject['set-cookie'] || []) as string[]
            for (const [name, value] of Object.entries(resCookies)) {
                if (name) {
                    setHeadersObject['set-cookie'].push(`${name}=${value}`)
                    if (opts?.debug) {
                        console.log(`\t${__DYE_BOLD__}${__DYE_YELLOW__}set-cookie=${__DYE_GREEN__}${name}=${value}${__DYE_RESET__}`)
                    }
                }
            }
        }

        return resp
    }
}
