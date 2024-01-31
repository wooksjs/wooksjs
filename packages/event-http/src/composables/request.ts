import { useEventId } from '@wooksjs/event-core'

import { useHttpContext } from '../event-http'

const xForwardedFor = 'x-forwarded-for'

export function useRequest() {
  const { store } = useHttpContext()
  const { init } = store('request')
  const event = store('event')
  const req = event.get('req')

  const rawBody = async () =>
    init(
      'rawBody',
      async () =>
        new Promise((resolve, reject) => {
          let body = Buffer.from('')
          req.on('data', chunk => {
            body = Buffer.concat([body, chunk])
          })
          req.on('error', err => {
            reject(err)
          })
          req.on('end', () => {
            resolve(body)
          })
        })
    )

  const reqId = useEventId().getId

  const forwardedIp = () =>
    init('forwardedIp', () => {
      if (typeof req.headers[xForwardedFor] === 'string' && req.headers[xForwardedFor]) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-asserted-optional-chain
        return req.headers[xForwardedFor].split(',').shift()?.trim()!
      } else {
        return ''
      }
    })

  const remoteIp = () =>
    init('remoteIp', () => req.socket.remoteAddress || req.connection.remoteAddress || '')

  function getIp(options?: { trustProxy: boolean }): string {
    return options?.trustProxy ? forwardedIp() || getIp() : remoteIp()
  }

  const getIpList = () =>
    init('ipList', () => ({
      remoteIp: req.socket.remoteAddress || req.connection.remoteAddress || '',
      forwarded: ((req.headers[xForwardedFor] as string) || '').split(',').map(s => s.trim()),
    }))

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
