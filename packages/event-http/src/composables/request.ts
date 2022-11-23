import { randomUUID } from 'crypto'
import { useHttpContext } from '../event-http'

const xForwardedFor = 'x-forwarded-for'

export function useRequest() {
    const { store } = useHttpContext()
    const { init } = store('request')
    const event = store('event')
    const { req } = event.value

    const rawBody = () => init('rawBody', () => {
        return new Promise((resolve, reject) => {
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
    })

    const reqId = () => init('reqId', () => randomUUID())

    const forwardedIp = () => init('forwardedIp', () => {
        if (typeof req.headers[xForwardedFor] === 'string' && req.headers[xForwardedFor]) {
            return req.headers[xForwardedFor].split(',').shift()?.trim() as string
        } else {
            return ''
        }        
    })

    const remoteIp = () => init('remoteIp', () => req.socket?.remoteAddress || req.connection?.remoteAddress || '')

    function getIp(options?: { trustProxy: boolean }): string {
        if (options?.trustProxy) {
            return forwardedIp() || getIp()
        } else {
            return remoteIp()
        }
    }

    const getIpList = () => init('ipList', () => {
        return {
            remoteIp: req.socket?.remoteAddress || req.connection?.remoteAddress || '',
            forwarded: (req.headers[xForwardedFor] as string || '').split(',').map(s => s.trim()),
        }
    })

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
