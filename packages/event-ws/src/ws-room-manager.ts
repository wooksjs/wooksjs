import type { WsConnection } from './ws-connection'
import type { WsBroadcastTransport } from './types'

/** Manages room → connections mapping with optional distributed broadcast transport. */
export class WsRoomManager {
  private readonly rooms = new Map<string, Set<WsConnection>>()

  constructor(private readonly transport?: WsBroadcastTransport) {
    if (transport) {
      // Inbound messages from other instances are handled via onTransportMessage
    }
  }

  /** Add a connection to a room. */
  join(connection: WsConnection, room: string): void {
    connection.rooms.add(room)
    let set = this.rooms.get(room)
    if (!set) {
      set = new Set()
      this.rooms.set(room, set)
      // First local connection in this room — subscribe via transport
      if (this.transport) {
        this.transport.subscribe(`ws:room:${room}`, (payload) => {
          this.onTransportMessage(room, payload)
        })
      }
    }
    set.add(connection)
  }

  /** Remove a connection from a room. */
  leave(connection: WsConnection, room: string): void {
    connection.rooms.delete(room)
    const set = this.rooms.get(room)
    if (!set) {
      return
    }
    set.delete(connection)
    if (set.size === 0) {
      this.rooms.delete(room)
      // Last local connection left — unsubscribe via transport
      if (this.transport) {
        this.transport.unsubscribe(`ws:room:${room}`)
      }
    }
  }

  /** Remove a connection from ALL rooms (called on disconnect). */
  leaveAll(connection: WsConnection): void {
    for (const room of connection.rooms) {
      const set = this.rooms.get(room)
      if (set) {
        set.delete(connection)
        if (set.size === 0) {
          this.rooms.delete(room)
          if (this.transport) {
            this.transport.unsubscribe(`ws:room:${room}`)
          }
        }
      }
    }
    connection.rooms.clear()
  }

  /** Get all connections in a room. */
  connections(room: string): Set<WsConnection> {
    return this.rooms.get(room) ?? new Set()
  }

  /** Broadcast to all connections in a room. */
  broadcast(
    room: string,
    event: string,
    path: string,
    data?: unknown,
    params?: Record<string, string>,
    exclude?: WsConnection,
  ): void {
    // Send to local connections
    const set = this.rooms.get(room)
    if (set) {
      for (const conn of set) {
        if (conn !== exclude) {
          conn.send(event, path, data, params)
        }
      }
    }

    // Publish to transport for other instances
    if (this.transport) {
      const payload = JSON.stringify({ event, path, data, params, excludeId: exclude?.id })
      this.transport.publish(`ws:room:${room}`, payload)
    }
  }

  /** Handle inbound message from broadcast transport (other instances). */
  private onTransportMessage(room: string, payload: string): void {
    const set = this.rooms.get(room)
    if (!set || set.size === 0) {
      return
    }

    try {
      const { event, path, data, params, excludeId } = JSON.parse(payload) as {
        event: string
        path: string
        data?: unknown
        params?: Record<string, string>
        excludeId?: string
      }
      for (const conn of set) {
        if (conn.id !== excludeId) {
          conn.send(event, path, data, params)
        }
      }
    } catch {
      // Silently ignore malformed transport messages
    }
  }
}
