import { defineWook, useRouteParams } from '@wooksjs/event-core'
import type { EventContext } from '@wooksjs/event-core'

import { wsConnectionKind, wsMessageKind } from '../ws-kind'
import { getAdapterState } from './state'

export interface WsBroadcastOptions {
  /** Room to broadcast to. Default: current message path. */
  room?: string
  /** Exclude the sender from the broadcast. Default: true. */
  excludeSelf?: boolean
}

/**
 * Provides room management for the current connection.
 * All methods default to the current message path as the room.
 * Only available in message context (inside `onMessage` handlers).
 */
export const useWsRooms = defineWook((ctx: EventContext) => {
  const messagePath = ctx.get(wsMessageKind.keys.messagePath)
  const connectionId = ctx.get(wsConnectionKind.keys.id)
  const state = getAdapterState()
  const connection = state.connections.get(connectionId)!

  return {
    /** Join a room. Default: current message path. */
    join(room?: string): void {
      state.roomManager.join(connection, room ?? messagePath)
    },

    /** Leave a room. Default: current message path. */
    leave(room?: string): void {
      state.roomManager.leave(connection, room ?? messagePath)
    },

    /** Broadcast to a room. Default room: current message path. */
    broadcast(event: string, data?: unknown, options?: WsBroadcastOptions): void {
      const room = options?.room ?? messagePath
      const excludeSelf = options?.excludeSelf ?? true

      // Extract route params from the room path using the router
      let params: Record<string, string> | undefined
      try {
        const rp = useRouteParams(ctx)
        const p = rp.params as Record<string, string>
        if (Object.keys(p).length > 0) {
          params = p
        }
      } catch {
        // No route params available
      }

      state.roomManager.broadcast(
        room,
        event,
        room,
        data,
        params,
        excludeSelf ? connection : undefined,
      )
    },

    /** List rooms this connection has joined. */
    rooms(): string[] {
      return [...connection.rooms]
    },
  }
})
