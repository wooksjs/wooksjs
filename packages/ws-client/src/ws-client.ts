import type {
  WsClientMessage,
  WsClientOptions,
  WsPushHandler,
  WsPushMessage,
  WsReplyMessage,
} from './types'
import { WsClientError } from './ws-client-error'
import { RpcTracker } from './rpc-tracker'
import { PushDispatcher } from './push-dispatcher'
import { MessageQueue } from './message-queue'
import { ReconnectController, normalizeReconnectConfig } from './reconnect'

const DEFAULT_RPC_TIMEOUT = 10_000

type WsConstructor = new (url: string, protocols?: string | string[]) => WebSocket

function getWebSocketImpl(override?: WsConstructor): WsConstructor {
  if (override) {
    return override
  }
  if (typeof WebSocket !== 'undefined') {
    return WebSocket
  }
  throw new TypeError(
    '@wooksjs/ws-client: No WebSocket implementation found. ' +
      'Install the "ws" package for Node.js < 22 or use a polyfill.',
  )
}

/** WebSocket client with RPC, subscriptions, reconnection, and push listeners. */
export class WsClient {
  private ws: WebSocket | null = null
  private readonly url: string
  private readonly protocols: string | string[] | undefined
  private readonly rpcTimeout: number
  private readonly serializer: (msg: WsClientMessage) => string
  private readonly parser: (raw: string) => WsReplyMessage | WsPushMessage
  private readonly WsImpl: WsConstructor

  private readonly rpc: RpcTracker
  private readonly dispatcher: PushDispatcher
  private readonly queue: MessageQueue
  private readonly reconnector: ReconnectController

  /** Active subscriptions for auto-resubscribe: path → data. */
  private readonly subscriptions = new Map<string, unknown>()

  private readonly openHandlers: Array<() => void> = []
  private readonly closeHandlers: Array<(code: number, reason: string) => void> = []
  private readonly errorHandlers: Array<(error: Event) => void> = []
  private readonly reconnectHandlers: Array<(attempt: number) => void> = []

  private closed = false

  constructor(url: string, options?: WsClientOptions) {
    this.url = url
    this.protocols = options?.protocols
    this.rpcTimeout = options?.rpcTimeout ?? DEFAULT_RPC_TIMEOUT
    this.serializer = options?.messageSerializer ?? JSON.stringify
    this.parser =
      options?.messageParser ?? (JSON.parse as (raw: string) => WsReplyMessage | WsPushMessage)
    this.WsImpl = getWebSocketImpl(options?._WebSocket as WsConstructor | undefined)

    this.rpc = new RpcTracker()
    this.dispatcher = new PushDispatcher()
    this.queue = new MessageQueue()
    this.reconnector = new ReconnectController(normalizeReconnectConfig(options?.reconnect))

    this.connect()
  }

  // ── Public API ──────────────────────────────────────────

  /** Fire-and-forget. Queued when disconnected with reconnect enabled. */
  send(event: string, path: string, data?: unknown): void {
    const msg: WsClientMessage = { event, path }
    if (data !== undefined) {
      msg.data = data
    }
    const serialized = this.serializer(msg)

    if (this.isOpen()) {
      this.ws!.send(serialized)
    } else if (this.reconnector.enabled) {
      this.queue.enqueue(serialized)
    }
  }

  /** RPC with auto-generated correlation ID. Rejects when not connected. */
  call<T = unknown>(event: string, path: string, data?: unknown): Promise<T> {
    if (!this.isOpen()) {
      return Promise.reject(new WsClientError(503, 'Not connected'))
    }

    const id = this.rpc.generateId()
    const msg: WsClientMessage = { event, path, id }
    if (data !== undefined) {
      msg.data = data
    }
    this.ws!.send(this.serializer(msg))

    return this.rpc.track(id, this.rpcTimeout) as Promise<T>
  }

  /** Subscribe to a path. Returns an unsubscribe function. Auto-resubscribes on reconnect. */
  async subscribe(path: string, data?: unknown): Promise<() => void> {
    await this.call('subscribe', path, data)
    this.subscriptions.set(path, data)

    return () => {
      this.subscriptions.delete(path)
      if (this.isOpen()) {
        this.send('unsubscribe', path)
      }
    }
  }

  /** Register a client-side push listener. Returns an unregister function. */
  on<T = unknown>(event: string, pathPattern: string, handler: WsPushHandler<T>): () => void {
    return this.dispatcher.on(event, pathPattern, handler)
  }

  /** Close the connection. Disables reconnect. Rejects pending RPCs. */
  close(): void {
    this.closed = true
    this.reconnector.stop()
    this.rpc.rejectAll(503, 'Connection closed')
    this.queue.clear()
    if (this.ws) {
      this.ws.close(1000, 'Client closed')
      this.ws = null
    }
  }

  // ── Lifecycle Events ────────────────────────────────────

  /** Register a handler called when the WebSocket connection opens. Returns an unregister function. */
  onOpen(handler: () => void): () => void {
    this.openHandlers.push(handler)
    return () => {
      const idx = this.openHandlers.indexOf(handler)
      if (idx !== -1) {
        this.openHandlers.splice(idx, 1)
      }
    }
  }

  /** Register a handler called when the WebSocket connection closes. Returns an unregister function. */
  onClose(handler: (code: number, reason: string) => void): () => void {
    this.closeHandlers.push(handler)
    return () => {
      const idx = this.closeHandlers.indexOf(handler)
      if (idx !== -1) {
        this.closeHandlers.splice(idx, 1)
      }
    }
  }

  /** Register a handler called on WebSocket errors. Returns an unregister function. */
  onError(handler: (error: Event) => void): () => void {
    this.errorHandlers.push(handler)
    return () => {
      const idx = this.errorHandlers.indexOf(handler)
      if (idx !== -1) {
        this.errorHandlers.splice(idx, 1)
      }
    }
  }

  /** Register a handler called before each reconnection attempt. Returns an unregister function. */
  onReconnect(handler: (attempt: number) => void): () => void {
    this.reconnectHandlers.push(handler)
    return () => {
      const idx = this.reconnectHandlers.indexOf(handler)
      if (idx !== -1) {
        this.reconnectHandlers.splice(idx, 1)
      }
    }
  }

  // ── Private ─────────────────────────────────────────────

  private isOpen(): boolean {
    return this.ws !== null && this.ws.readyState === 1 // WebSocket.OPEN
  }

  private connect(): void {
    if (this.closed) {
      return
    }

    const ws = new this.WsImpl(this.url, this.protocols)
    this.ws = ws

    ws.addEventListener('open', () => {
      this.reconnector.reset()
      this.queue.flush((data) => ws.send(data))
      this.resubscribe()
      for (const h of this.openHandlers) {
        h()
      }
    })

    ws.addEventListener('close', (ev: CloseEvent) => {
      this.rpc.rejectAll(503, 'Connection lost')
      for (const h of this.closeHandlers) {
        h(ev.code, ev.reason ?? '')
      }

      if (!this.closed && this.reconnector.enabled) {
        this.reconnector.schedule(() => {
          for (const h of this.reconnectHandlers) {
            h(this.reconnector.currentAttempt)
          }
          this.connect()
        })
      }
    })

    ws.addEventListener('error', (ev: Event) => {
      for (const h of this.errorHandlers) {
        h(ev)
      }
    })

    ws.addEventListener('message', (ev: MessageEvent) => {
      this.handleMessage(ev.data as string)
    })
  }

  private handleMessage(raw: string): void {
    let msg: WsReplyMessage | WsPushMessage
    try {
      msg = this.parser(raw)
    } catch {
      return
    }

    if ('id' in msg && (msg as WsReplyMessage).id !== undefined) {
      this.rpc.resolve(msg as WsReplyMessage)
      return
    }

    if ('event' in msg && 'path' in msg) {
      this.dispatcher.dispatch(msg as WsPushMessage)
    }
  }

  private resubscribe(): void {
    for (const [path, data] of this.subscriptions) {
      this.call('subscribe', path, data).catch(() => {
        // Swallow — will retry on next reconnect
      })
    }
  }
}

/**
 * Creates a new WebSocket client.
 *
 * @example
 * ```ts
 * const client = createWsClient('wss://api.example.com', { reconnect: true })
 *
 * client.on('message', '/chat/*', ({ data }) => console.log(data))
 * await client.subscribe('/chat/rooms/lobby')
 * client.send('message', '/chat/rooms/lobby', { text: 'hello' })
 *
 * const me = await client.call('rpc', '/users/me')
 * ```
 */
export function createWsClient(url: string, options?: WsClientOptions): WsClient {
  return new WsClient(url, options)
}
