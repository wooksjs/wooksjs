import { randomUUID } from 'crypto'
import { useHttpContext } from '../http-event'

const xForwardedFor = 'x-forwarded-for'

export function useRequest() {
    const { store } = useHttpContext()
    const { hook } = store('request')
    const event = store('event')
    const { req } = event.value

    async function rawBody(): Promise<Buffer> {
        const _rawBody = hook('rawBody')
        if (!_rawBody.isDefined) {
            return _rawBody.value = new Promise((resolve, reject) => {
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
            })
        }
        return _rawBody.value
    }

    function reqId(): string {
        const _reqId = hook('reqId')
        if (!_reqId.isDefined) {
            return _reqId.value = randomUUID()
        }
        return _reqId.value as string
    }

    function getIp(options?: { trustProxy: boolean }): string {
        if (options?.trustProxy) {
            const _forwardedIp = hook('forwardedIp')
            if (!_forwardedIp.isDefined) {
                if (typeof req.headers[xForwardedFor] === 'string' && req.headers[xForwardedFor]) {
                    return _forwardedIp.value = req.headers[xForwardedFor].split(',').shift()?.trim() as string
                } else {
                    return getIp()
                }
            }
            return _forwardedIp.value as string
        } else {
            const _remoteIp = hook('remoteIp')
            if (!_remoteIp.isDefined) {
                return _remoteIp.value = req.socket?.remoteAddress || req.connection?.remoteAddress || ''
            }
            return _remoteIp.value as string
        }
    }

    function getIpList() {
        const _ipList = hook('ipList')
        if (!_ipList.isDefined) {
            return _ipList.value = {
                remoteIp: req.socket?.remoteAddress || req.connection?.remoteAddress || '',
                forwarded: (req.headers[xForwardedFor] as string || '').split(',').map(s => s.trim()),
            }
        }
        return _ipList.value
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

export function useRouteParams<T extends object = Record<string, string | string[]>>() {
    const { store } = useHttpContext()
    const event = store('event')
    const routeParams = event.value.params as T

    function getRouteParam<K extends keyof T>(name: K) {
        return routeParams[name] as T[K]
    }

    return {
        routeParams,
        getRouteParam,
    }
}
