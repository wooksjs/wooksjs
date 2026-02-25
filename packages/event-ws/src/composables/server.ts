import type { WsConnection } from '../ws-connection'
import { getAdapterState } from './state'

/**
 * Provides server-wide operations. Available in any context.
 * Not a `defineWook` — reads directly from the adapter state.
 */
export function useWsServer() {
  const state = getAdapterState()

  return {
    /** All active connections. */
    connections(): Map<string, WsConnection> {
      return state.connections
    },

    /** Broadcast to ALL connections (not room-scoped). */
    broadcast(event: string, path: string, data?: unknown, params?: Record<string, string>): void {
      for (const conn of state.connections.values()) {
        conn.send(event, path, data, params)
      }
    },

    /** Get a specific connection by ID. */
    getConnection(id: string): WsConnection | undefined {
      return state.connections.get(id)
    },

    /** Get all connections in a room. */
    roomConnections(room: string): Set<WsConnection> {
      return state.roomManager.connections(room)
    },
  }
}
