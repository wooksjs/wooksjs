import { IncomingMessage, ServerResponse } from 'http'
import { Socket } from 'net'

import { createHttpContext } from './event-http'
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

export function setTestHttpContext(options: TTestHttpContext) {
  const req = new IncomingMessage(new Socket({}))
  req.method = options.method || 'GET'
  req.headers = options.headers || {}
  req.url = options.url
  const res = new ServerResponse(req)
  const { store } = createHttpContext({ req, res }, {})
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
      }
    }
  }
}
