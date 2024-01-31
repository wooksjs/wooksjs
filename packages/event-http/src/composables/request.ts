import { useEventId } from '@wooksjs/event-core'

import { useHttpContext } from '../event-http'

const xForwardedFor = 'x-forwarded-for'

export function useRequest() {
  const { store } = useHttpContext()
  const { init } = store('request')
  const event = store('event')
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const req = event.get('req')!

  const rawBody = () =>
    init(
      'rawBody',
      () =>
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
        // eslint-disable-next-line @typescript-eslint/no-non-null-asserted-optional-chain, @typescript-eslint/no-non-null-assertion
        return req.headers[xForwardedFor].split(',').shift()?.trim()!
      } else {
        return ''
      }
    })

  const remoteIp = () =>
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    init('remoteIp', () => req.socket.remoteAddress || req.connection.remoteAddress || '')!

  function getIp(options?: { trustProxy: boolean }): string {
    if (options?.trustProxy) {
      return forwardedIp() || getIp()
    } else {
      return remoteIp()
    }
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
