import { createEventContext, current } from '@wooksjs/event-core'
import type { EventContextOptions } from '@wooksjs/event-core'

import { httpKind } from './http-kind'
import { HttpResponse } from './response/http-response'
import type { THttpEventData } from './types'

/** Creates an async event context for an incoming HTTP request/response pair. */
export function createHttpContext(
  data: THttpEventData,
  options: EventContextOptions,
  ResponseClass: typeof HttpResponse = HttpResponse,
) {
  const response = new ResponseClass(data.res, data.req, options.logger)
  return <R>(fn: () => R): R =>
    createEventContext(
      options,
      httpKind,
      {
        req: data.req,
        response,
        requestLimits: data.requestLimits,
      },
      fn,
    )
}

/** Returns the current HTTP event context. */
export function useHttpContext(ctx?: EventContext): EventContext {
  return ctx ?? current()
}
