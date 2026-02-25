import { EventContext, routeParamsKey, run } from '@wooksjs/event-core'
import { Buffer } from 'buffer'
import { IncomingMessage, ServerResponse } from 'http'
import { Socket } from 'net'

import { rawBodySlot } from './composables/request'
import { httpKind } from './http-kind'
import { HttpResponse } from './response/http-response'
import type { TRequestLimits } from './types'

/** Options for creating a test HTTP event context. */
export interface TTestHttpContext {
  /** Pre-set route parameters (e.g. `{ id: '42' }`). */
  params?: Record<string, string | string[]>
  /** Request URL (e.g. `/api/users?page=1`). */
  url: string
  /** Request headers. */
  headers?: Record<string, string>
  /** HTTP method (default: `'GET'`). */
  method?: string
  /** Custom request body limits. */
  requestLimits?: TRequestLimits
  /** Pre-seed the raw body for body-parsing tests. */
  rawBody?: string | Buffer
  /** Default headers to pre-populate on the response (e.g. from `securityHeaders()`). */
  defaultHeaders?: Record<string, string | string[]>
}

/**
 * Creates a fully initialized HTTP event context for testing.
 *
 * Sets up an `EventContext` with a fake `IncomingMessage`, `HttpResponse`, route params,
 * and optional pre-seeded body. Returns a runner function that executes callbacks inside the context scope.
 *
 * @example
 * ```ts
 * const run = prepareTestHttpContext({ url: '/users/42', params: { id: '42' } })
 * run(() => {
 *   const { params } = useRouteParams()
 *   expect(params.id).toBe('42')
 * })
 * ```
 */
export function prepareTestHttpContext(options: TTestHttpContext) {
  const req = new IncomingMessage(new Socket({}))
  req.method = options.method || 'GET'
  req.headers = options.headers || {}
  req.url = options.url
  const res = new ServerResponse(req)
  const response = new HttpResponse(res, req, console as any, options.defaultHeaders)

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
