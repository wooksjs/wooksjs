import { EventContext, routeParamsKey, run } from '@wooksjs/event-core'
import { Buffer } from 'buffer'
import { IncomingMessage, ServerResponse } from 'http'
import { Socket } from 'net'

import { rawBodySlot } from './composables/request'
import { httpKind } from './http-kind'
import { HttpResponse } from './response/http-response'
import type { TRequestLimits } from './types'

export interface TTestHttpContext {
  params?: Record<string, string | string[]>
  url: string
  headers?: Record<string, string>
  method?: string
  requestLimits?: TRequestLimits
  /** Pre-seed the raw body for body-parsing tests. */
  rawBody?: string | Buffer
}

export function prepareTestHttpContext(options: TTestHttpContext) {
  const req = new IncomingMessage(new Socket({}))
  req.method = options.method || 'GET'
  req.headers = options.headers || {}
  req.url = options.url
  const res = new ServerResponse(req)
  const response = new HttpResponse(res, req, console as any)

  const ctx = new EventContext({ logger: console as any })
  ctx.attach(httpKind, { req, response, requestLimits: options.requestLimits })

  if (options.params) {
    ctx.set(routeParamsKey, options.params)
  }

  if (options.rawBody !== undefined) {
    const buf = Buffer.isBuffer(options.rawBody) ? options.rawBody : Buffer.from(options.rawBody)
    ctx.set(rawBodySlot, Promise.resolve(buf))
  }

  return <T>(cb: (...a: any[]) => T) => run(ctx, cb)
}
