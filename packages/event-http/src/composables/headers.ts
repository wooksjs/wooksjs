import type { EventContext } from '@wooksjs/event-core'
import type { IncomingHttpHeaders } from 'http'

import { useRequest } from './request'

/**
 * Returns the incoming request headers.
 * @example
 * ```ts
 * const { host, authorization } = useHeaders()
 * ```
 */
export function useHeaders(ctx?: EventContext): IncomingHttpHeaders {
  return useRequest(ctx).headers
}
