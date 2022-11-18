import { IncomingMessage, ServerResponse } from 'http'
import { panic } from 'common/panic'

export type TWooksParamsType = Record<string, string | string[]>

export interface TCurrentWooksContext {
    req: IncomingMessage
    res: ServerResponse
    params?: TWooksParamsType
    cache?: TWooksContextCache
}

let currentContext: Required<TCurrentWooksContext> | null = null

export type TWooksContextCache = Record<string | symbol, unknown>

export function createWooksCtx(ctx: TCurrentWooksContext) {
    const newContext = {
        req: ctx.req,
        res: ctx.res,
        params: ctx.params || {},
        cache: ctx.cache || {},
    }
    
    // for compatibility with express use getter
    Object.defineProperty(newContext, 'params', {
        get: () => ctx.params || (ctx.req as unknown as {params: TWooksParamsType}).params || {},
    })

    currentContext = newContext
    return getCtxHelpers(newContext)
}

function getCtxHelpers(cc: Required<TCurrentWooksContext>) {
    return {
        getCtx: () => cc,
        restoreCtx: () => currentContext = cc,
        clearCtx: () => currentContext = null,
        replaceParams: (newParams: TWooksParamsType) => cc.params = newParams,
    }
}

export function useWooksCtx() {
    if (!currentContext) {
        throw panic('Use HTTP hooks only synchronously within the runtime of the request.')
    }
    const cc = currentContext
    return getCtxHelpers(cc)
}

export const innerCacheSymbols = {
    searchParams: Symbol('searchParams'),
    cookies: Symbol('cookies'),
    accept: Symbol('accept'),
    authorization: Symbol('authorization'),
    setHeader: Symbol('setHeader'),
    setCookies: Symbol('setCookies'),
    status: Symbol('status'),
    response: Symbol('response'),
    request: Symbol('request'),
}
