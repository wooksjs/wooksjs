import type { TConsoleBase } from '@prostojs/logger'
import { createEventContext, current, key, run } from '@wooksjs/event-core'
import type { EventContext, EventContextOptions } from '@wooksjs/event-core'
import http from 'http'
import type { IncomingMessage, Server } from 'http'
import type { Duplex } from 'stream'
import type { TWooksHandler, Wooks, WooksUpgradeHandler } from 'wooks'
import { WooksAdapterBase } from 'wooks'

import { createDefaultWsServerAdapter } from './adapters/ws-adapter-default'
import { setAdapterState } from './composables/state'
import type {
  TWooksWsOptions,
  WsClientMessage,
  WsPushMessage,
  WsReplyMessage,
  WsServerInstance,
} from './types'
import { WsConnection } from './ws-connection'
import { WsError } from './ws-error'
import { wsConnectionKind, wsMessageKind } from './ws-kind'
import { WsRoomManager } from './ws-room-manager'

const DEFAULT_HEARTBEAT_INTERVAL = 30_000
const DEFAULT_MAX_MESSAGE_SIZE = 1024 * 1024 // 1 MB

// WS-owned context keys for upgrade data (set by HTTP adapter via the contract)
const upgradeReqKey = key<IncomingMessage>('ws:upgrade-req')
const upgradeSocketKey = key<Duplex>('ws:upgrade-socket')
const upgradeHeadKey = key<Buffer>('ws:upgrade-head')

/** WebSocket adapter for Wooks. Implements WooksUpgradeHandler for HTTP integration. */
export class WooksWs extends WooksAdapterBase implements WooksUpgradeHandler {
  protected logger: TConsoleBase
  protected eventContextOptions: EventContextOptions
  private readonly connections = new Map<string, WsConnection>()
  private readonly roomManager: WsRoomManager
  private readonly wsServer: WsServerInstance
  private readonly opts: TWooksWsOptions
  private readonly serializer: (msg: WsReplyMessage | WsPushMessage) => string | Buffer
  private readonly parser: (raw: Buffer | string) => WsClientMessage

  private onConnectHandler?: TWooksHandler
  private onDisconnectHandler?: TWooksHandler
  private heartbeatTimer?: ReturnType<typeof setInterval>
  private server?: Server

  // ── WooksUpgradeHandler contract ────────────────────────────────

  readonly reqKey = upgradeReqKey
  readonly socketKey = upgradeSocketKey
  readonly headKey = upgradeHeadKey

  constructor(wooksOrOpts?: Wooks | WooksAdapterBase | TWooksWsOptions, opts?: TWooksWsOptions) {
    const isWooks =
      wooksOrOpts instanceof WooksAdapterBase || (wooksOrOpts && 'getRouter' in wooksOrOpts)
    const wooks = isWooks ? (wooksOrOpts as Wooks | WooksAdapterBase) : undefined
    const resolvedOpts = isWooks ? (opts ?? {}) : ((wooksOrOpts as TWooksWsOptions) ?? {})

    super(wooks, resolvedOpts.logger, undefined)

    // Auto-register as upgrade handler when created with an HTTP adapter
    if (wooksOrOpts && typeof (wooksOrOpts as Record<string, unknown>).ws === 'function') {
      ;(wooksOrOpts as { ws(handler: WooksUpgradeHandler): void }).ws(this)
    }

    this.opts = resolvedOpts
    this.logger = resolvedOpts.logger || this.getLogger(`${__DYE_CYAN_BRIGHT__}[wooks-ws]`)
    this.eventContextOptions = this.getEventContextOptions()
    this.serializer = resolvedOpts.messageSerializer ?? JSON.stringify
    this.parser = resolvedOpts.messageParser ?? defaultParser
    this.roomManager = new WsRoomManager(resolvedOpts.broadcastTransport)

    const adapter = resolvedOpts.wsServerAdapter ?? createDefaultWsServerAdapter()
    this.wsServer = adapter.create()

    // Expose adapter state to composables
    setAdapterState({
      connections: this.connections,
      roomManager: this.roomManager,
      serializer: this.serializer,
      wooks: this.wooks as unknown as Wooks,
    })
  }

  /** Register a handler that runs when a new WebSocket connection is established. */
  onConnect(handler: TWooksHandler): void {
    this.onConnectHandler = handler
  }

  /** Register a handler that runs when a WebSocket connection closes. */
  onDisconnect(handler: TWooksHandler): void {
    this.onDisconnectHandler = handler
  }

  /** Register a routed message handler. Uses the standard Wooks router internally. */
  onMessage<ResType = unknown, ParamsType = Record<string, string | string[]>>(
    event: string,
    path: string,
    handler: TWooksHandler<ResType>,
  ) {
    return this.on<ResType, ParamsType>(event, path, handler)
  }

  /**
   * Complete the WebSocket handshake from inside an UPGRADE route handler.
   * Reads req/socket/head from the current HTTP context (set by the HTTP adapter).
   * The HTTP context becomes the parent of the WS connection context.
   */
  upgrade(): void {
    const httpCtx = current()
    const req = httpCtx.get(upgradeReqKey)
    const socket = httpCtx.get(upgradeSocketKey)
    const head = httpCtx.get(upgradeHeadKey)
    this.doUpgrade(req, socket, head, httpCtx)
  }

  /**
   * Fallback: called by the HTTP adapter when no UPGRADE route matches.
   * Also used internally for standalone mode.
   */
  handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    this.doUpgrade(req, socket, head)
  }

  /** Start a standalone server (without event-http). */
  async listen(port: number, hostname?: string): Promise<void> {
    const server = (this.server = http.createServer())
    server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      this.doUpgrade(req, socket, head)
    })
    this.startHeartbeat()
    return new Promise((resolve, reject) => {
      server.once('listening', resolve)
      server.once('error', reject)
      if (hostname) {
        server.listen(port, hostname)
      } else {
        server.listen(port)
      }
    })
  }

  /** Stop the server and clean up. */
  close(): void {
    this.stopHeartbeat()
    this.wsServer.close()
    for (const conn of this.connections.values()) {
      conn.close(1001, 'Server shutting down')
    }
    this.connections.clear()
  }

  /** Returns the underlying HTTP server (if any). */
  getServer(): Server | undefined {
    return this.server
  }

  // ── Core upgrade logic ────────────────────────────────────────────

  private doUpgrade(
    req: IncomingMessage,
    socket: Duplex,
    head: Buffer,
    parentCtx?: EventContext,
  ): void {
    this.wsServer.handleUpgrade(req, socket, head, (ws) => {
      const id = crypto.randomUUID()
      const ctxOptions: EventContextOptions = {
        ...this.eventContextOptions,
        ...(parentCtx ? { parent: parentCtx } : {}),
      }

      createEventContext(ctxOptions, wsConnectionKind, { id, ws }, () => {
        const connectionCtx = current()
        const connection = new WsConnection(id, ws, connectionCtx, this.serializer)

        // Run onConnect handler
        try {
          if (this.onConnectHandler) {
            const result = this.onConnectHandler()
            if (
              result !== null &&
              result !== undefined &&
              typeof (result as any).then === 'function'
            ) {
              ;(result as Promise<unknown>)
                .then(() => this.acceptConnection(connection))
                .catch((error) => this.rejectConnection(connection, error))
              return
            }
          }
          this.acceptConnection(connection)
        } catch (error) {
          this.rejectConnection(connection, error)
        }
      })
    })
  }

  private acceptConnection(connection: WsConnection): void {
    this.connections.set(connection.id, connection)
    this.logger.debug(`WS connected: ${connection.id}`)

    const ws = connection.ws

    ws.on('message', (raw: Buffer | string) => {
      this.handleMessage(connection, raw)
    })

    ws.on('close', () => {
      this.handleClose(connection)
    })

    ws.on('error', (err: Error) => {
      this.logger.error(`WS error [${connection.id}]:`, err)
    })

    ws.on('pong', () => {
      connection.alive = true
    })
  }

  private rejectConnection(connection: WsConnection, error: unknown): void {
    const code = error instanceof WsError ? error.code : 500
    const message = error instanceof Error ? error.message : 'Connection rejected'
    this.logger.debug(`WS rejected: ${message}`)
    const wsCloseCode = code === 401 || code === 403 ? 1008 : 1011
    connection.close(wsCloseCode, message)
  }

  // ── Message handler ──────────────────────────────────────────────

  private handleMessage(connection: WsConnection, raw: Buffer | string): void {
    const maxSize = this.opts.maxMessageSize ?? DEFAULT_MAX_MESSAGE_SIZE
    const size = typeof raw === 'string' ? Buffer.byteLength(raw) : raw.length
    if (size > maxSize) {
      this.logger.debug(`WS message too large (${size} > ${maxSize}), dropping`)
      return
    }

    let msg: WsClientMessage
    try {
      msg = this.parser(raw)
    } catch {
      this.logger.debug('WS message parse failed, dropping')
      return
    }

    const { event, path, data, id: messageId } = msg

    createEventContext(
      { ...this.eventContextOptions, parent: connection.ctx },
      wsMessageKind,
      { data, rawMessage: raw, messageId, messagePath: path, messageEvent: event },
      () => {
        const msgCtx = current()
        const handlers = this.wooks.lookupHandlers(event, path, msgCtx)

        if (!handlers) {
          if (messageId !== undefined) {
            connection.replyError(messageId, 404, 'Not found')
          }
          return
        }

        const result = this.processHandlers(handlers, connection, messageId)
        if (result !== null && result !== undefined && typeof (result as any).then === 'function') {
          ;(result as Promise<unknown>).catch((error) => {
            this.handleHandlerError(error, connection, messageId)
          })
        }
      },
    )
  }

  private processHandlers(
    handlers: TWooksHandler[],
    connection: WsConnection,
    messageId: string | number | undefined,
  ): void | Promise<unknown> {
    for (let i = 0; i < handlers.length; i++) {
      const handler = handlers[i]
      const isLast = i === handlers.length - 1
      try {
        const result = handler()
        if (result !== null && result !== undefined && typeof (result as any).then === 'function') {
          return this.processAsyncResult(
            result as Promise<unknown>,
            handlers,
            i,
            connection,
            messageId,
          )
        }
        this.sendReply(connection, messageId, result)
        return
      } catch (error) {
        if (isLast) {
          this.handleHandlerError(error, connection, messageId)
          return
        }
      }
    }
  }

  private async processAsyncResult(
    promise: Promise<unknown>,
    handlers: TWooksHandler[],
    startIndex: number,
    connection: WsConnection,
    messageId: string | number | undefined,
  ): Promise<void> {
    try {
      const result = await promise
      this.sendReply(connection, messageId, result)
      return
    } catch (error) {
      if (startIndex === handlers.length - 1) {
        this.handleHandlerError(error, connection, messageId)
        return
      }
    }
    for (let i = startIndex + 1; i < handlers.length; i++) {
      const isLast = i === handlers.length - 1
      try {
        const result = await (handlers[i]() as Promise<unknown>)
        this.sendReply(connection, messageId, result)
        return
      } catch (error) {
        if (isLast) {
          this.handleHandlerError(error, connection, messageId)
          return
        }
      }
    }
  }

  private sendReply(
    connection: WsConnection,
    messageId: string | number | undefined,
    data: unknown,
  ): void {
    if (messageId === undefined) {
      return
    }
    connection.reply(messageId, data ?? null)
  }

  private handleHandlerError(
    error: unknown,
    connection: WsConnection,
    messageId: string | number | undefined,
  ): void {
    const code = error instanceof WsError ? error.code : 500
    const message = error instanceof WsError ? error.message : 'Internal Error'

    if (messageId !== undefined) {
      connection.replyError(messageId, code, message)
    }

    if (!(error instanceof WsError)) {
      this.logger.error('Uncaught WS handler error:', error)
    }
  }

  // ── Close handler ────────────────────────────────────────────────

  private handleClose(connection: WsConnection): void {
    this.logger.debug(`WS disconnected: ${connection.id}`)

    if (this.onDisconnectHandler) {
      try {
        const result = run(connection.ctx, this.onDisconnectHandler)
        if (result !== null && result !== undefined && typeof (result as any).then === 'function') {
          ;(result as Promise<unknown>).catch((error) => {
            this.logger.error('onDisconnect error:', error)
          })
        }
      } catch (error) {
        this.logger.error('onDisconnect error:', error)
      }
    }

    this.roomManager.leaveAll(connection)
    this.connections.delete(connection.id)
  }

  // ── Heartbeat ────────────────────────────────────────────────────

  private startHeartbeat(): void {
    const interval = this.opts.heartbeatInterval ?? DEFAULT_HEARTBEAT_INTERVAL
    if (interval === 0) {
      return
    }

    this.heartbeatTimer = setInterval(() => {
      for (const conn of this.connections.values()) {
        if (!conn.alive) {
          this.logger.debug(`WS heartbeat timeout: ${conn.id}`)
          conn.ws.close(1001, 'Heartbeat timeout')
          continue
        }
        conn.alive = false
        conn.ws.ping()
      }
    }, interval)

    if (this.heartbeatTimer.unref) {
      this.heartbeatTimer.unref()
    }
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = undefined
    }
  }
}

// ── Default parser ─────────────────────────────────────────────────

function defaultParser(raw: Buffer | string): WsClientMessage {
  const str = typeof raw === 'string' ? raw : raw.toString('utf8')
  const parsed = JSON.parse(str) as WsClientMessage
  if (typeof parsed.event !== 'string' || typeof parsed.path !== 'string') {
    throw new TypeError('Invalid WS message: missing event or path')
  }
  return parsed
}

// ── Factory ────────────────────────────────────────────────────────

/**
 * Creates a new WooksWs WebSocket adapter.
 *
 * @example Integrated with HTTP (recommended):
 * ```ts
 * const http = createHttpApp()
 * const ws = createWsApp(http) // auto-registers upgrade contract
 * http.upgrade('/ws', () => ws.upgrade())
 * http.listen(3000)
 * ```
 *
 * @example Standalone:
 * ```ts
 * const ws = createWsApp({ heartbeatInterval: 30_000 })
 * ws.listen(3000)
 * ```
 */
export function createWsApp(
  wooksOrOpts?: Wooks | WooksAdapterBase | TWooksWsOptions,
  opts?: TWooksWsOptions,
): WooksWs {
  return new WooksWs(wooksOrOpts, opts)
}
