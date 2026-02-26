import type { TConsoleBase } from '@prostojs/logger'
import { createEventContext, current } from '@wooksjs/event-core'
import type { EventContext, EventContextOptions } from '@wooksjs/event-core'
import type { IncomingMessage, Server, ServerResponse } from 'http'
import http from 'http'
import type { ListenOptions } from 'net'
import type { Duplex } from 'stream'
import type { TWooksHandler, TWooksOptions, Wooks, WooksUpgradeHandler } from 'wooks'
import { WooksAdapterBase } from 'wooks'

import { HttpError } from './errors'
import { httpKind } from './http-kind'
import type { HttpResponse } from './response/http-response'
import { WooksHttpResponse } from './response/wooks-http-response'
import type { TRequestLimits } from './types'

/** Configuration options for the WooksHttp adapter. */
export interface TWooksHttpOptions {
  logger?: TConsoleBase
  onNotFound?: TWooksHandler
  router?: TWooksOptions['router']
  /** Default request body limits applied to every request (overridable per-request via `useRequest()`). */
  requestLimits?: Omit<TRequestLimits, 'perRequest'>
  /** Custom HttpResponse subclass. Defaults to WooksHttpResponse (HTML/JSON/text error rendering). */
  responseClass?: typeof WooksHttpResponse
  /** Default headers applied to every response. Use `securityHeaders()` for recommended security headers. */
  defaultHeaders?: Record<string, string | string[]>
}

/** HTTP adapter for Wooks that provides route registration, server lifecycle, and request handling. */
export class WooksHttp extends WooksAdapterBase {
  protected logger: TConsoleBase
  protected ResponseClass: typeof WooksHttpResponse
  protected eventContextOptions: EventContextOptions

  constructor(
    protected opts?: TWooksHttpOptions,
    wooks?: Wooks | WooksAdapterBase,
  ) {
    super(wooks, opts?.logger, opts?.router)
    this.logger = opts?.logger || this.getLogger(`${__DYE_CYAN_BRIGHT__}[wooks-http]`)
    this.ResponseClass = opts?.responseClass ?? WooksHttpResponse
    this.eventContextOptions = this.getEventContextOptions()
  }

  /** Registers a handler for all HTTP methods on the given path. */
  all<ResType = unknown, ParamsType = Record<string, string | string[]>>(
    path: string,
    handler: TWooksHandler<ResType>,
  ) {
    return this.on<ResType, ParamsType>('*', path, handler)
  }

  /** Registers a GET route handler. */
  get<ResType = unknown, ParamsType = Record<string, string | string[]>>(
    path: string,
    handler: TWooksHandler<ResType>,
  ) {
    return this.on<ResType, ParamsType>('GET', path, handler)
  }

  /** Registers a POST route handler. */
  post<ResType = unknown, ParamsType = Record<string, string | string[]>>(
    path: string,
    handler: TWooksHandler<ResType>,
  ) {
    return this.on<ResType, ParamsType>('POST', path, handler)
  }

  /** Registers a PUT route handler. */
  put<ResType = unknown, ParamsType = Record<string, string | string[]>>(
    path: string,
    handler: TWooksHandler<ResType>,
  ) {
    return this.on<ResType, ParamsType>('PUT', path, handler)
  }

  /** Registers a PATCH route handler. */
  patch<ResType = unknown, ParamsType = Record<string, string | string[]>>(
    path: string,
    handler: TWooksHandler<ResType>,
  ) {
    return this.on<ResType, ParamsType>('PATCH', path, handler)
  }

  /** Registers a DELETE route handler. */
  delete<ResType = unknown, ParamsType = Record<string, string | string[]>>(
    path: string,
    handler: TWooksHandler<ResType>,
  ) {
    return this.on<ResType, ParamsType>('DELETE', path, handler)
  }

  /** Registers a HEAD route handler. */
  head<ResType = unknown, ParamsType = Record<string, string | string[]>>(
    path: string,
    handler: TWooksHandler<ResType>,
  ) {
    return this.on<ResType, ParamsType>('HEAD', path, handler)
  }

  /** Registers an OPTIONS route handler. */
  options<ResType = unknown, ParamsType = Record<string, string | string[]>>(
    path: string,
    handler: TWooksHandler<ResType>,
  ) {
    return this.on<ResType, ParamsType>('OPTIONS', path, handler)
  }

  /** Registers an UPGRADE route handler for WebSocket upgrade requests. */
  upgrade<ResType = unknown, ParamsType = Record<string, string | string[]>>(
    path: string,
    handler: TWooksHandler<ResType>,
  ) {
    return this.on<ResType, ParamsType>('UPGRADE', path, handler)
  }

  private wsHandler?: WooksUpgradeHandler

  /** Register a WebSocket upgrade handler that implements the WooksUpgradeHandler contract. */
  ws(handler: WooksUpgradeHandler): void {
    this.wsHandler = handler
  }

  protected server?: Server

  /**
   * Starts the http(s) server.
   *
   * Use this only if you rely on Wooks server.
   */
  public listen(
    port?: number,
    hostname?: string,
    backlog?: number,
    listeningListener?: () => void,
  ): Promise<void>
  public listen(port?: number, hostname?: string, listeningListener?: () => void): Promise<void>
  public listen(port?: number, backlog?: number, listeningListener?: () => void): Promise<void>
  public listen(port?: number, listeningListener?: () => void): Promise<void>
  public listen(path: string, backlog?: number, listeningListener?: () => void): Promise<void>
  public listen(path: string, listeningListener?: () => void): Promise<void>
  public listen(options: ListenOptions, listeningListener?: () => void): Promise<void>
  public listen(handle: unknown, backlog?: number, listeningListener?: () => void): Promise<void>
  public listen(handle: unknown, listeningListener?: () => void): Promise<void>
  public async listen(
    port?: number | string | ListenOptions,
    hostname?: number | string | (() => void),
    backlog?: number | (() => void),
    listeningListener?: () => void,
  ) {
    const server = (this.server = http.createServer(this.getServerCb() as http.RequestListener))
    if (this.wsHandler) {
      const upgradeCb = this.getUpgradeCb()
      server.on('upgrade', upgradeCb)
    }
    return new Promise((resolve, reject) => {
      server.once('listening', resolve)
      server.once('error', reject)
      let args = [port as number, hostname as string, backlog as number, listeningListener]
      const ui = args.indexOf(undefined)
      if (ui >= 0) {
        args = args.slice(0, ui)
      }
      server.listen(...(args as [number]))
    })
  }

  /**
   * Stops the server if it was attached or passed via argument
   * @param server
   */
  public close(server?: Server) {
    const srv = server || this.server
    return new Promise((resolve, reject) => {
      srv?.close((err) => {
        if (err) {
          reject(err)
          return
        }
        resolve(srv)
      })
    })
  }

  /**
   * Returns http(s) server that was attached to Wooks
   *
   * See attachServer method docs
   * @returns Server
   */
  getServer() {
    return this.server
  }

  /**
   * Attaches http(s) server instance
   * to Wooks.
   *
   * Use it only if you want to `close` method to stop the server.
   * @param server Server
   */
  attachServer(server?: Server) {
    this.server = server
  }

  protected respond(
    data: unknown,
    response: HttpResponse,
    ctx: EventContext,
  ): void | Promise<void> {
    if (response.responded) {
      return
    }

    if (data instanceof Error) {
      const httpError = data instanceof HttpError ? data : new HttpError(500, data.message)
      return response.sendError(httpError, ctx)
    }

    if (data !== response) {
      response.body = data
    }

    return response.send()
  }

  /**
   * Returns server callback function
   * that can be passed to any node server:
   * ```js
   * import { createHttpApp } from '@wooksjs/event-http'
   * import http from 'http'
   *
   * const app = createHttpApp()
   * const server = http.createServer(app.getServerCb())
   * server.listen(3000)
   * ```
   */
  getServerCb() {
    const ctxOptions = this.eventContextOptions
    const RequestLimits = this.opts?.requestLimits
    const notFoundHandler = this.opts?.onNotFound
    const defaultHeaders = this.opts?.defaultHeaders

    return (req: IncomingMessage, res: ServerResponse) => {
      const response = new this.ResponseClass(res, req, ctxOptions.logger, defaultHeaders)
      const method = req.method || ''
      const url = req.url || ''

      createEventContext(ctxOptions, httpKind, { req, response, requestLimits: RequestLimits }, () => {
        const ctx = current()
        const handlers = this.wooks.lookupHandlers(method, url, ctx)
        if (handlers || notFoundHandler) {
          const result = this.processHandlers(
            handlers || [notFoundHandler as TWooksHandler],
            ctx,
            response,
          )
          // Only attach .catch() if processHandlers returned a Promise (async handler)
          if (
            result !== null &&
            result !== undefined &&
            typeof (result as Promise<unknown>).then === 'function'
          ) {
            ;(result as Promise<unknown>).catch((error) => {
              this.logger.error('Internal error, please report', error)
              this.respond(error, response, ctx)
            })
          }
        } else {
          this.logger.debug(`404 Not found (${method})${url}`)
          const error = new HttpError(404)
          this.respond(error, response, ctx)
        }
      })
    }
  }

  /**
   * Returns upgrade callback function for the HTTP server's 'upgrade' event.
   * Creates an HTTP context, seeds it with upgrade data, and routes as method 'UPGRADE'.
   */
  getUpgradeCb() {
    const ctxOptions = this.eventContextOptions
    const requestLimits = this.opts?.requestLimits
    const wsHandler = this.wsHandler

    return (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      if (!wsHandler) {
        socket.destroy()
        return
      }

      const url = req.url || ''

      createEventContext(ctxOptions, httpKind, {
        req,
        response: undefined as unknown as HttpResponse,
        requestLimits,
      }, () => {
        const ctx = current()

        // Set WS-owned keys on the context
        ctx.set(wsHandler.reqKey, req)
        ctx.set(wsHandler.socketKey, socket)
        ctx.set(wsHandler.headKey, head)

        const handlers = this.wooks.lookupHandlers('UPGRADE', url, ctx)
        if (handlers) {
          this.processUpgradeHandlers(handlers, ctx, socket)
        } else {
          // No matching UPGRADE route — delegate to WS handler directly
          wsHandler.handleUpgrade(req, socket, head)
        }
      })
    }
  }

  protected processUpgradeHandlers(
    handlers: TWooksHandler[],
    ctx: EventContext,
    socket: Duplex,
  ): void | Promise<unknown> {
    for (let i = 0; i < handlers.length; i++) {
      const handler = handlers[i]
      const isLastHandler = i === handlers.length - 1
      try {
        const result = handler()
        if (
          result !== null &&
          result !== undefined &&
          typeof (result as Promise<unknown>).then === 'function'
        ) {
          ;(result as Promise<unknown>).catch((error) => {
            this.logger.error(
              `Upgrade handler error: ${ctx.get(httpKind.keys.req)?.url || ''}`,
              error,
            )
            socket.destroy()
          })
          return
        }
        // Sync handler succeeded — upgrade is handled by ws.upgrade() side-effect
        return
      } catch (error) {
        if (!(error instanceof HttpError)) {
          this.logger.error(
            `Upgrade handler error: ${ctx.get(httpKind.keys.req)?.url || ''}`,
            error,
          )
        }
        if (isLastHandler) {
          socket.destroy()
          return
        }
      }
    }
  }

  protected processHandlers(
    handlers: TWooksHandler[],
    ctx: EventContext,
    response: HttpResponse,
  ): void | Promise<unknown> {
    for (let i = 0; i < handlers.length; i++) {
      const handler = handlers[i]
      const isLastHandler = i === handlers.length - 1
      try {
        const result = handler()
        // If handler returned a thenable, switch to async processing
        if (
          result !== null &&
          result !== undefined &&
          typeof (result as Promise<unknown>).then === 'function'
        ) {
          return this.processAsyncResult(result as Promise<unknown>, handlers, i, ctx, response)
        }
        // Sync handler — respond synchronously (no Promise allocated)
        this.respond(result, response, ctx)
        return
      } catch (error) {
        if (!(error instanceof HttpError)) {
          this.logger.error(
            `Uncaught route handler exception: ${ctx.get(httpKind.keys.req)?.url || ''}`,
            error,
          )
        }
        if (isLastHandler) {
          this.respond(error, response, ctx)
          return
        }
      }
    }
  }

  private async processAsyncResult(
    promise: Promise<unknown>,
    handlers: TWooksHandler[],
    startIndex: number,
    ctx: EventContext,
    response: HttpResponse,
  ): Promise<unknown> {
    try {
      const result = await promise
      await this.respond(result, response, ctx)
      return result
    } catch (error) {
      const isLastHandler = startIndex === handlers.length - 1
      if (!(error instanceof HttpError)) {
        this.logger.error(
          `Uncaught route handler exception: ${ctx.get(httpKind.keys.req)?.url || ''}`,
          error,
        )
      }
      if (isLastHandler) {
        await this.respond(error, response, ctx)
        return error
      }
    }
    // Continue with remaining handlers (async path)
    for (let i = startIndex + 1; i < handlers.length; i++) {
      const handler = handlers[i]
      const isLastHandler = i === handlers.length - 1
      try {
        const result = await (handler() as Promise<unknown>)
        await this.respond(result, response, ctx)
        return result
      } catch (error) {
        if (!(error instanceof HttpError)) {
          this.logger.error(
            `Uncaught route handler exception: ${ctx.get(httpKind.keys.req)?.url || ''}`,
            error,
          )
        }
        if (isLastHandler) {
          await this.respond(error, response, ctx)
          return error
        }
      }
    }
  }
}

/**
 * Creates a new WooksHttp application instance.
 * @example
 * ```ts
 * const app = createHttpApp()
 * app.get('/hello', () => 'Hello World!')
 * app.listen(3000)
 * ```
 */
export function createHttpApp(opts?: TWooksHttpOptions, wooks?: Wooks | WooksAdapterBase) {
  return new WooksHttp(opts, wooks)
}
