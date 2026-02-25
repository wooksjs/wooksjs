import type { EventContext } from '@wooksjs/event-core'

import type { WsPushMessage, WsReplyMessage, WsSocket } from './types'

/** Internal class representing a connected WebSocket client. */
export class WsConnection {
  readonly rooms = new Set<string>()
  alive = true

  constructor(
    readonly id: string,
    readonly ws: WsSocket,
    readonly ctx: EventContext,
    private readonly serializer: (msg: WsReplyMessage | WsPushMessage) => string | Buffer,
  ) {}

  /** Send a push message to this connection. */
  send(event: string, path: string, data?: unknown, params?: Record<string, string>): void {
    if (this.ws.readyState !== 1) {
      return
    } // OPEN = 1
    const msg: WsPushMessage = { event, path }
    if (params) {
      msg.params = params
    }
    if (data !== undefined) {
      msg.data = data
    }
    this.ws.send(this.serializer(msg))
  }

  /** Send a reply to a client request. */
  reply(id: string | number, data?: unknown): void {
    if (this.ws.readyState !== 1) {
      return
    }
    const msg: WsReplyMessage = { id }
    if (data !== undefined) {
      msg.data = data
    }
    this.ws.send(this.serializer(msg))
  }

  /** Send an error reply to a client request. */
  replyError(id: string | number, code: number, message: string): void {
    if (this.ws.readyState !== 1) {
      return
    }
    const msg: WsReplyMessage = { id, error: { code, message } }
    this.ws.send(this.serializer(msg))
  }

  /** Close the connection. */
  close(code?: number, reason?: string): void {
    this.ws.close(code, reason)
  }
}
