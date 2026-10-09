import type { EventContext } from '@wooksjs/event-core'

import type { WsPushMessage, WsReplyMessage, WsSocket } from './types'

type TWsSerializer = (msg: WsReplyMessage | WsPushMessage) => string | Buffer

function pushMessage(
  event: string,
  path: string,
  data?: unknown,
  params?: Record<string, string>,
): WsPushMessage {
  const msg: WsPushMessage = { event, path }
  if (params) {
    msg.params = params
  }
  if (data !== undefined) {
    msg.data = data
  }
  return msg
}

/** Internal class representing a connected WebSocket client. */
export class WsConnection {
  readonly rooms = new Set<string>()
  alive = true

  constructor(
    readonly id: string,
    readonly ws: WsSocket,
    readonly ctx: EventContext,
    private readonly serializer: TWsSerializer,
  ) {}

  /** Send a push message to this connection. */
  send(event: string, path: string, data?: unknown, params?: Record<string, string>): void {
    if (this.ws.readyState !== 1) {
      return
    } // OPEN = 1
    this.ws.send(this.serializer(pushMessage(event, path, data, params)))
  }

  /**
   * Send an already serialized frame (e.g. one push message serialized once for many recipients).
   * Skipped when the socket is not open, like `send()`.
   */
  sendSerialized(payload: string | Buffer): void {
    if (this.ws.readyState !== 1) {
      return
    }
    this.ws.send(payload)
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

  /**
   * Sends one push message to many connections, serializing it once per distinct serializer
   * (connections of one adapter share one) and only when an open recipient exists.
   * @internal
   */
  static sendPushToMany(
    connections: Iterable<WsConnection>,
    skip: ((conn: WsConnection) => boolean) | undefined,
    event: string,
    path: string,
    data?: unknown,
    params?: Record<string, string>,
  ): void {
    let msg: WsPushMessage | undefined
    let serializer: TWsSerializer | undefined
    let payload: string | Buffer = ''
    for (const conn of connections) {
      if (conn.ws.readyState !== 1 || (skip && skip(conn))) {
        continue
      }
      if (conn.serializer !== serializer) {
        serializer = conn.serializer
        payload = serializer((msg ??= pushMessage(event, path, data, params)))
      }
      conn.sendSerialized(payload)
    }
  }

  /** Close the connection. */
  close(code?: number, reason?: string): void {
    this.ws.close(code, reason)
  }
}
