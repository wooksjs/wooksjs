import { defineEventKind, slot } from '@wooksjs/event-core'
import type { IncomingMessage } from 'http'

import type { HttpResponse } from './response/http-response'
import type { TRequestLimits } from './types'

/** Event kind definition for HTTP requests. Provides typed context slots for `req`, `response`, and `requestLimits`. */
export const httpKind = defineEventKind('http', {
  req: slot<IncomingMessage>(),
  response: slot<HttpResponse>(),
  requestLimits: slot<TRequestLimits | undefined>(),
})
