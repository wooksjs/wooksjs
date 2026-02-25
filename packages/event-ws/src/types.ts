import type { TConsoleBase } from '@prostojs/logger'
import type { IncomingMessage } from 'http'
import type { Duplex } from 'stream'

// ── Wire Protocol (SPEC §1) ──────────────────────────────────────────

/** Client-to-server message. */
export interface WsClientMessage {
  /** Event type — used as the router method (e.g. "message", "subscribe", "unsubscribe", "rpc"). */
  event: string
  /** Route path (e.g. "/chat/rooms/lobby"). Always a concrete path, never a pattern. */
  path: string
  /** Payload. */
  data?: unknown
  /** Optional correlation ID. When present, the server sends a reply with the same ID. */
  id?: string | number
}

/** Server-to-client reply (sent only when client message included an `id`). */
export interface WsReplyMessage {
  /** Correlation ID matching the client's request. */
  id: string | number
  /** Response payload (handler return value). */
  data?: unknown
  /** Error (mutually exclusive with data). */
  error?: { code: number; message: string }
}

/** Server-to-client push (broadcast, direct send, subscription notification). */
export interface WsPushMessage {
  /** Event type. */
  event: string
  /** The concrete path this message relates to. */
  path: string
  /** Route params extracted from the path by the server router. */
  params?: Record<string, string>
  /** Payload. */
  data?: unknown
}

// ── WsSocket Abstraction (SPEC §5) ───────────────────────────────────

/** Minimal WebSocket instance interface (compatible with ws, uWebSockets.js, Bun). */
export interface WsSocket {
  send(data: string | Buffer): void
  close(code?: number, reason?: string): void
  on(event: 'message', handler: (data: Buffer | string) => void): void
  on(event: 'close', handler: (code: number, reason: Buffer) => void): void
  on(event: 'error', handler: (err: Error) => void): void
  on(event: 'pong', handler: () => void): void
  ping(): void
  readonly readyState: number
}

/** WebSocket server instance (handles upgrades, tracks no connections itself). */
export interface WsServerInstance {
  handleUpgrade(
    req: IncomingMessage,
    socket: Duplex,
    head: Buffer,
    cb: (ws: WsSocket) => void,
  ): void
  close(): void
}

/** Factory that creates a WebSocket server in noServer mode. */
export interface WsServerAdapter {
  create(): WsServerInstance
}

// ── Broadcast Transport (SPEC §8) ────────────────────────────────────

/** Pluggable transport for cross-instance broadcasting (e.g. Redis pub/sub). */
export interface WsBroadcastTransport {
  /** Publish a message to a channel (other instances will receive it). */
  publish(channel: string, payload: string): void | Promise<void>
  /** Subscribe to messages on a channel. */
  subscribe(channel: string, handler: (payload: string) => void): void | Promise<void>
  /** Unsubscribe from a channel. */
  unsubscribe(channel: string): void | Promise<void>
}

// ── Options (SPEC §3.2) ──────────────────────────────────────────────

export interface TWooksWsOptions {
  /** Heartbeat ping interval in ms (default: 30000). Set 0 to disable. */
  heartbeatInterval?: number
  /** Heartbeat pong timeout in ms (default: 5000). Connection closed if pong not received. */
  heartbeatTimeout?: number
  /** Custom message parser. Default: JSON.parse expecting WsClientMessage shape. */
  messageParser?: (raw: Buffer | string) => WsClientMessage
  /** Custom message serializer. Default: JSON.stringify. */
  messageSerializer?: (msg: WsReplyMessage | WsPushMessage) => string | Buffer
  /** Logger instance. */
  logger?: TConsoleBase
  /** Max message size in bytes (default: 1MB). Messages exceeding this are silently dropped. */
  maxMessageSize?: number
  /** Custom WsServerAdapter. Default: wraps the `ws` package. */
  wsServerAdapter?: WsServerAdapter
  /** Broadcast transport for multi-instance deployments. Default: local only. */
  broadcastTransport?: WsBroadcastTransport
}
