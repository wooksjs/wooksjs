import { current, defineWook } from '@wooksjs/event-core'
import type { EventContext } from '@wooksjs/event-core'

import type { WsConnection } from '../ws-connection'
import { wsConnectionKind } from '../ws-kind'
import { getAdapterState } from './state'

/**
 * Returns the connection `EventContext` from either connection-level or message-level handlers.
 * Mirrors `current()` from `@wooksjs/event-core`.
 *
 * - In `onConnect` / `onDisconnect`: returns `current()` directly.
 * - In `onMessage`: returns `current().parent` (the connection context).
 */
export function currentConnection(ctx?: EventContext): EventContext {
  const c = ctx ?? current()
  return c.parent ?? c
}

/**
 * Provides access to the current WebSocket connection (id, send, close).
 * Works in both connection and message contexts via parent chain traversal.
 */
export const useWsConnection = defineWook((ctx: EventContext) => {
  const id = ctx.get(wsConnectionKind.keys.id)
  const ws = ctx.get(wsConnectionKind.keys.ws)
  const state = getAdapterState()
  const connection = state.connections.get(id) as WsConnection

  return {
    /** Unique connection ID. */
    id,
    /** Send a push message to this connection. */
    send(event: string, path: string, data?: unknown, params?: Record<string, string>): void {
      connection.send(event, path, data, params)
    },
    /** Close the connection. */
    close(code?: number, reason?: string): void {
      ws.close(code, reason)
    },
    /** The connection EventContext (for advanced use). */
    context: currentConnection(ctx),
  }
})
