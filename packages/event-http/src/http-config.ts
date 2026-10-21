import { key } from '@wooksjs/event-core'
import type { EventContext } from '@wooksjs/event-core'

import type { HttpError, TWooksErrorBodyExt } from './errors/http-error'
import type { TProxyHeaders, TTrustProxyFn } from './utils/proxy'

/**
 * Transforms every error body before the response renders it (JSON, HTML or text).
 * See `TWooksHttpOptions.transformErrorBody`.
 */
export type TTransformErrorBody = (
  body: TWooksErrorBodyExt,
  error: HttpError,
  ctx: EventContext,
) => TWooksErrorBodyExt

/** @internal App-level settings composables read per request (set by the adapter). */
export interface THttpAppConfig {
  trustProxy?: TTrustProxyFn
  proxyHeaders: TProxyHeaders
  transformErrorBody?: TTransformErrorBody
}

/** @internal */
export const httpAppConfigKey = key<THttpAppConfig>('http.appConfig')

const NO_CONFIG: THttpAppConfig = Object.freeze({ proxyHeaders: 'x-forwarded' })

/** @internal The app settings of the HTTP event `ctx` belongs to (defaults when none were set). */
export function getHttpAppConfig(ctx: EventContext): THttpAppConfig {
  return ctx.has(httpAppConfigKey) ? ctx.get(httpAppConfigKey) : NO_CONFIG
}
