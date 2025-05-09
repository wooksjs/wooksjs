import { asyncStorage } from '@wooksjs/event-core'
import { IncomingMessage, ServerResponse } from 'http'
import { Socket } from 'net'

import { createHttpContext, useHttpContext } from './event-http'
import type { TAuthCache, THttpContextStore } from './types'

export interface TTestHttpContext {
  params?: Record<string, string | string[]>
  url: string
  headers?: Record<string, string>
  method?: string
  cachedContext?: {
    cookies?: Record<string, string | null>
    authorization?: TAuthCache
    body?: unknown
    rawBody?: string | Buffer | Promise<Buffer>
    raw?: TCachedContext
  }
}

type TCachedContext = {
  [name in keyof THttpContextStore]?: unknown
}

export function prepareTestHttpContext(options: TTestHttpContext) {
  const req = new IncomingMessage(new Socket({}))
  req.method = options.method || 'GET'
  req.headers = options.headers || {}
  req.url = options.url
  const res = new ServerResponse(req)
  const runInContext = createHttpContext({ req, res }, {})
  const ctx = runInContext(() => {
    const { store, getCtx } = useHttpContext()
    store('routeParams').value = options.params
    if (options.cachedContext) {
      for (const key of Object.keys(options.cachedContext)) {
        switch (key) {
          case 'cookies': {
            store('cookies').value = options.cachedContext.cookies
            break
          }
          case 'authorization': {
            store('authorization').value = options.cachedContext.authorization
            break
          }
          case 'body': {
            store('request').set('parsed', options.cachedContext.body)
            break
          }
          case 'rawBody': {
            store('request').set('rawBody', options.cachedContext.rawBody)
            break
          }
          case 'raw': {
            for (const [key, value] of Object.entries(options.cachedContext.raw!)) {
              store<keyof THttpContextStore>(key as keyof THttpContextStore).value =
                value as THttpContextStore[keyof THttpContextStore]
            }
            break
          }
          default: {
            throw new Error(`Unknown cached context key: ${key}`)
          }
        }
      }
    }
    return getCtx()
  })
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return <T>(cb: (...a: any[]) => T) => asyncStorage.run(ctx, cb)
}
