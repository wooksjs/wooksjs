import { TCookiesCache } from './composables/cookies'
import { createWooksCtx, innerCacheSymbols, TWooksContextCache, TWooksParamsType } from './core'
import { IncomingMessage, ServerResponse } from 'http'
import { Socket } from 'net'
import { TAuthCache } from './composables/header-authorization'

export interface TTestWooksContext {
    params?: TWooksParamsType
    url: string
    headers?: Record<string, string>
    method?: string
    cachedContext?: {
        cookies?: TCookiesCache
        authorization?: TAuthCache
        body?: unknown
        rawBody?: string | Buffer | Promise<Buffer>
        [name: string | symbol]: unknown
    }
}

export function setTestWooksContext(options: TTestWooksContext) {
    const req = new IncomingMessage(new Socket({}))
    req.method = options.method || 'GET'
    req.headers = options.headers || {}
    req.url = options.url
    const res = new ServerResponse(req)
    const cache: TWooksContextCache = {}
    if (options.cachedContext) {
        const fromInnerContext = [
            'cookies',
            'authorization',
        ]
        for (const key of Object.keys(options.cachedContext)) {
            if (fromInnerContext.includes(key)) {
                cache[innerCacheSymbols[key as keyof typeof innerCacheSymbols]] = options.cachedContext[key]
            } else if (key === 'body') {
                cache[innerCacheSymbols.request] = cache[innerCacheSymbols.request] || {}
                Object.assign(cache[innerCacheSymbols.request] as Record<string, unknown>, { parsed: options.cachedContext[key] })
            } else if (key === 'rawBody') {
                cache[innerCacheSymbols.request] = cache[innerCacheSymbols.request] || {}
                Object.assign(cache[innerCacheSymbols.request] as Record<string, unknown>, { rawBody: options.cachedContext[key] })
            } else {
                cache[key] = options.cachedContext[key]
            }
        }
    }
    createWooksCtx({ req, res, params: options.params, cache })
}
