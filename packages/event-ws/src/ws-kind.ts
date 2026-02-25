import { defineEventKind, slot } from '@wooksjs/event-core'

import type { WsSocket } from './types'

/** Event kind for WebSocket connections (long-lived, one per client). */
export const wsConnectionKind = defineEventKind('ws:connection', {
  id: slot<string>(),
  ws: slot<WsSocket>(),
})

/** Event kind for WebSocket messages (short-lived, one per incoming message). */
export const wsMessageKind = defineEventKind('ws:message', {
  data: slot<unknown>(),
  rawMessage: slot<Buffer | string>(),
  messageId: slot<string | number | undefined>(),
  messagePath: slot<string>(),
  messageEvent: slot<string>(),
})
