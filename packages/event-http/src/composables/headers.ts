import { current } from '@wooksjs/event-core'
import type { EventContext } from '@wooksjs/event-core'
import type { IncomingHttpHeaders } from 'http'

import { httpKind } from '../http-kind'

/**
 * Returns the incoming request headers.
 * @example
 * ```ts
 * const { host, authorization } = useHeaders()
 * ```
 */
export function useHeaders(ctx?: EventContext): IncomingHttpHeaders {
  return (ctx ?? current()).get(httpKind.keys.req).headers
}
