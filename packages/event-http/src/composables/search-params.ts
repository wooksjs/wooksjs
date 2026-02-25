import { cached, defineWook } from '@wooksjs/event-core'
import type { EventContext } from '@wooksjs/event-core'

import { httpKind } from '../http-kind'
import { WooksURLSearchParams } from '../utils/url-search-params'

const rawSearchParamsSlot = cached((ctx: EventContext) => {
  const url = ctx.get(httpKind.keys.req).url || ''
  const i = url.indexOf('?')
  return i >= 0 ? url.slice(i) : ''
})

const urlSearchParamsSlot = cached(
  (ctx: EventContext) => new WooksURLSearchParams(ctx.get(rawSearchParamsSlot)),
)

/**
 * Provides access to URL search (query) parameters from the request.
 * @example
 * ```ts
 * const { params, toJson } = useUrlParams()
 * const page = params().get('page')
 * ```
 */
export const useUrlParams = defineWook((ctx: EventContext) => ({
  raw: () => ctx.get(rawSearchParamsSlot),
  params: () => ctx.get(urlSearchParamsSlot),
  toJson: () => ctx.get(urlSearchParamsSlot).toJson(),
}))
