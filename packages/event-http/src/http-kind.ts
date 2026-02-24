import { defineEventKind, slot } from '@wooksjs/event-core'
import type { IncomingMessage } from 'http'

import type { HttpResponse } from './response/http-response'
import type { TRequestLimits } from './types'

export const httpKind = defineEventKind('http', {
  req: slot<IncomingMessage>(),
  response: slot<HttpResponse>(),
  requestLimits: slot<TRequestLimits | undefined>(),
})
