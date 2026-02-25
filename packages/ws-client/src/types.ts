// ── Wire Protocol (duplicated from @wooksjs/event-ws for zero-dep isolation) ──

/** Client-to-server message. */
export interface WsClientMessage {
  /** Event type — used as the router method on the server. */
  event: string
  /** Route path (always concrete, never a pattern). */
  path: string
  /** Payload. */
  data?: unknown
  /** Correlation ID. When present, the server sends a reply with the same ID. */
  id?: number
}

/** Server-to-client reply (sent only when the client message included an `id`). */
export interface WsReplyMessage {
  /** Correlation ID matching the client's request. */
  id: string | number
  /** Response payload. */
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
  /** Route params extracted by the server router. */
  params?: Record<string, string>
  /** Payload. */
  data?: unknown
}

// ── Client Options ──────────────────────────────────────────

/** Reconnection behaviour configuration for the WebSocket client. */
export interface WsClientReconnectOptions {
  /** Whether reconnection is enabled. */
  enabled: boolean
  /** Max reconnection attempts (default: Infinity). */
  maxRetries?: number
  /** Base delay in ms (default: 1000). */
  baseDelay?: number
  /** Max delay in ms (default: 30000). */
  maxDelay?: number
  /** Backoff strategy (default: "exponential"). */
  backoff?: 'linear' | 'exponential'
}

/** Options for {@link WsClient} / {@link createWsClient}. */
export interface WsClientOptions {
  /** Protocols passed to the WebSocket constructor. */
  protocols?: string | string[]
  /** Reconnection config. */
  reconnect?: boolean | WsClientReconnectOptions
  /** Timeout for RPC calls in ms (default: 10000). */
  rpcTimeout?: number
  /** Custom message parser. Default: JSON.parse. */
  messageParser?: (raw: string) => WsReplyMessage | WsPushMessage
  /** Custom message serializer. Default: JSON.stringify. */
  messageSerializer?: (msg: WsClientMessage) => string
  /** @internal For testing only — override the WebSocket constructor. */
  _WebSocket?: new (url: string, protocols?: string | string[]) => WebSocket
}

// ── Client Push Event ───────────────────────────────────────

/** Payload shape received by `client.on()` handlers. */
export interface WsClientPushEvent<T = unknown> {
  /** Event type from server. */
  event: string
  /** Concrete path from server. */
  path: string
  /** Route params extracted by the server. */
  params: Record<string, string>
  /** Payload. */
  data: T
}

/** Push message handler. */
export type WsPushHandler<T = unknown> = (ev: WsClientPushEvent<T>) => void
