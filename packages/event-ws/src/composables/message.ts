import { defineWook } from '@wooksjs/event-core'
import type { EventContext } from '@wooksjs/event-core'

import { wsMessageKind } from '../ws-kind'

/**
 * Provides access to the current WebSocket message data.
 * Only available in message context (inside `onMessage` handlers).
 */
export function useWsMessage<T = unknown>(ctx?: EventContext) {
  return useWsMessageInternal(ctx) as WsMessageResult<T>
}

interface WsMessageResult<T> {
  /** Parsed message data (typed via generic). */
  data: T
  /** Raw message before parsing. */
  raw: Buffer | string
  /** Correlation ID (undefined if fire-and-forget). */
  id: string | number | undefined
  /** Message path. */
  path: string
  /** Message event type. */
  event: string
}

const useWsMessageInternal = defineWook((ctx: EventContext) => {
  return {
    data: ctx.get(wsMessageKind.keys.data),
    raw: ctx.get(wsMessageKind.keys.rawMessage),
    id: ctx.get(wsMessageKind.keys.messageId),
    path: ctx.get(wsMessageKind.keys.messagePath),
    event: ctx.get(wsMessageKind.keys.messageEvent),
  }
})
