import { innerCacheSymbols, TWooksParamsType, useWooksCtx } from '../core'
import { randomUUID } from 'crypto'
import { useCacheStore } from '../cache'

const xForwardedFor = 'x-forwarded-for'

export function useRequest() {
    const reqHandle = useCacheStore<{
        rawBody: Promise<Buffer>
        reqId?: string
        forwardedIp?: string
        remoteIp?: string
        ipList?: { remoteIp: string, forwarded: string[] }
    }>(innerCacheSymbols.request)
    const { req } = useWooksCtx().getCtx()

    async function rawBody() {
        if (!reqHandle.has('rawBody')) {
            return reqHandle.set('rawBody', new Promise((resolve, reject) => {
                let body = Buffer.from('')
                req.on('data', function(chunk) {
                    body = Buffer.concat([body, chunk])
                })
                req.on('error', function(err) {
                    reject(err)
                })
                req.on('end', function() {
                    resolve(body)
                })
            }))
        }
        return reqHandle.get('rawBody') as Promise<Buffer>
    }

    function reqId(): string {
        if (!reqHandle.has('reqId')) {
            return reqHandle.set('reqId', randomUUID())
        }
        return reqHandle.get('reqId') as string
    }

    function getIp(options?: { trustProxy: boolean }): string {
        if (options?.trustProxy) {
            if (!reqHandle.has('forwardedIp')) {
                if (typeof req.headers[xForwardedFor] === 'string' && req.headers[xForwardedFor]) {
                    return reqHandle.set('forwardedIp', req.headers[xForwardedFor].split(',').shift()?.trim() as string)
                } else {
                    return getIp()
                }
            }
            return reqHandle.get('forwardedIp') as string
        } else {
            if (!reqHandle.has('remoteIp')) {
                return reqHandle.set('remoteIp', req.socket?.remoteAddress || req.connection?.remoteAddress || '')
            }
            return reqHandle.get('remoteIp') as string
        }
    }

    function getIpList() {
        if (!reqHandle.has('ipList')) {
            return reqHandle.set('ipList', {
                remoteIp: req.socket?.remoteAddress || req.connection?.remoteAddress || '',
                forwarded: (req.headers[xForwardedFor] as string || '').split(',').map(s => s.trim()),
            })
        }
        return reqHandle.get('ipList')
    }

    return {
        rawRequest: req,
        url: req.url,
        method: req.method,
        headers: req.headers,
        rawBody,
        reqId,
        getIp,
        getIpList,
    }
}

export function useRouteParams<T extends TWooksParamsType = TWooksParamsType>() {
    const routeParams = useWooksCtx().getCtx().params as T

    function getRouteParam<T2 extends string | string[] | undefined = string | string[] | undefined>(name: string) {
        return routeParams[name] as T2
    }

    return {
        routeParams,
        getRouteParam,
    }
}
