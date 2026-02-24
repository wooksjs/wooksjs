import { current } from '@wooksjs/event-core'
import type { EventContext } from '@wooksjs/event-core'

import { httpKind } from '../http-kind'
import type { HttpResponse } from '../response/http-response'

/**
 * Returns the HttpResponse instance for the current request.
 * All response operations (status, headers, cookies, cache control, sending)
 * are methods on the returned object.
 *
 * @example
 * ```ts
 * const response = useResponse()
 * response.status = 200
 * response.setHeader('x-custom', 'value')
 * response.setCookie('session', 'abc', { httpOnly: true })
 * ```
 */
export function useResponse(ctx?: EventContext): HttpResponse {
  return (ctx ?? current()).get(httpKind.keys.response)
}
