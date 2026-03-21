import type { TConsoleBase } from '@prostojs/logger'
import { current, tryGetCurrent } from '@wooksjs/event-core'
import type { EventContext, EventContextOptions } from '@wooksjs/event-core'
import { Buffer } from 'buffer'
import http, { IncomingMessage, ServerResponse } from 'http'
import type { Server } from 'http'
import type { ListenOptions } from 'net'
import { Duplex } from 'stream'
import type { TWooksHandler, TWooksOptions, Wooks, WooksUpgradeHandler } from 'wooks'
import { WooksAdapterBase } from 'wooks'

import { rawBodySlot } from './composables/request'
import { HttpError } from './errors'
import { createHttpContext } from './event-http'
import { httpKind } from './http-kind'
import type { HttpResponse } from './response/http-response'
import { recordToWebHeaders } from './response/http-response'
import { WooksHttpResponse } from './response/wooks-http-response'
import type { TRequestLimits } from './types'

const DEFAULT_FORWARD_HEADERS = [
  'authorization',
  'cookie',
  'accept-language',
  'x-forwarded-for',
  'x-request-id',
]

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
  /**
   * Headers forwarded from the calling HTTP context during programmatic `fetch()`.
   * Set to `false` to disable forwarding entirely.
   * @default ['authorization', 'cookie', 'accept-language', 'x-forwarded-for', 'x-request-id']
   */
  forwardHeaders?: string[] | false
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
  getServerCb(onNoMatch?: (req: IncomingMessage, res: ServerResponse) => void) {
    const ctxOptions = this.eventContextOptions
    const RequestLimits = this.opts?.requestLimits
    const notFoundHandler = this.opts?.onNotFound
    const defaultHeaders = this.opts?.defaultHeaders

    return (req: IncomingMessage, res: ServerResponse) => {
      const response = new this.ResponseClass(res, req, ctxOptions.logger, defaultHeaders)
      const method = req.method || ''
      const url = req.url || ''

      createHttpContext(ctxOptions, { req, response, requestLimits: RequestLimits }, () => {
        const ctx = current()
        const handlers = this.wooks.lookupHandlers(method, url, ctx)
        if (handlers) {
          return this.processAndCatch(handlers, ctx, response)
        } else if (onNoMatch) {
          onNoMatch(req, res)
        } else if (notFoundHandler) {
          return this.processAndCatch([notFoundHandler as TWooksHandler], ctx, response)
        } else {
          this.logger.debug(`404 Not found (${method})${url}`)
          const error = new HttpError(404)
          this.respond(error, response, ctx)
          return error
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

      createHttpContext(ctxOptions, { req, response: undefined, requestLimits }, () => {
        const ctx = current()

        // Set WS-owned keys on the context
        ctx.set(wsHandler.reqKey, req)
        ctx.set(wsHandler.socketKey, socket)
        ctx.set(wsHandler.headKey, head)

        const handlers = this.wooks.lookupHandlers('UPGRADE', url, ctx)
        if (handlers) {
          return this.processUpgradeHandlers(handlers, ctx, socket)
        } else {
          // No matching UPGRADE route — delegate to WS handler directly
          return wsHandler.handleUpgrade(req, socket, head)
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

  /** Runs handlers and attaches a `.catch()` for async results to avoid unhandled rejections. */
  private processAndCatch(
    handlers: TWooksHandler[],
    ctx: EventContext,
    response: HttpResponse,
  ): void | Promise<unknown> {
    const result = this.processHandlers(handlers, ctx, response)
    if (result !== null && result !== undefined && typeof (result as Promise<unknown>).then === 'function') {
      ;(result as Promise<unknown>).catch((error) => {
        this.logger.error('Internal error, please report', error)
        this.respond(error, response, ctx)
      })
    }
    return result
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

  /**
   * Programmatic route invocation using the Web Standard fetch API.
   * Goes through the full dispatch pipeline: context creation, route matching,
   * handler execution, response finalization.
   *
   * When called from within an existing HTTP context (e.g. during SSR),
   * identity headers (authorization, cookie) are automatically forwarded
   * from the calling request unless already present on the given Request.
   *
   * @param request - A Web Standard Request object.
   * @returns A Web Standard Response, or `null` if no route matched (and no `onNotFound` handler is set).
   */
  async fetch(request: Request): Promise<Response | null> {
    const url = new URL(request.url)
    const method = request.method
    const pathname = url.pathname + url.search

    // Detect calling context for header forwarding
    const callerCtx = tryGetCurrent()
    let callerReq: IncomingMessage | undefined
    if (callerCtx) {
      try {
        callerReq = callerCtx.get(httpKind.keys.req)
      } catch {
        // Not in an HTTP context — skip forwarding
      }
    }

    // Build synthetic Node.js request
    const fakeReq = createFakeIncomingMessage(
      request,
      pathname,
      callerReq,
      this.opts?.forwardHeaders,
    )
    const fakeRes = new ServerResponse(fakeReq)

    // Intercept direct writes to the ServerResponse so handlers using
    // getRawRes() still produce a valid Web Response from captured data.
    // Allocated lazily — most handlers never touch getRawRes().
    let rawChunks: Buffer[] | undefined
    let rawHeaders: Record<string, string | string[]> | undefined
    let rawStatusCode = 0
    fakeRes.writeHead = ((...args: unknown[]): ServerResponse => {
      rawStatusCode = args[0] as number
      // writeHead(code, headers) or writeHead(code, reason, headers)
      for (const arg of args) {
        if (typeof arg === 'object' && arg !== null) {
          if (!rawHeaders) { rawHeaders = {} }
          for (const [k, v] of Object.entries(arg as Record<string, string | string[]>)) {
            rawHeaders[k] = v
          }
        }
      }
      return fakeRes
    }) as typeof fakeRes.writeHead
    fakeRes.write = ((chunk: unknown, _encoding?: unknown, cb?: unknown): boolean => {
      if (chunk !== null && chunk !== undefined) {
        if (!rawChunks) { rawChunks = [] }
        rawChunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk as Buffer)
      }
      if (typeof cb === 'function') { (cb as () => void)() }
      return true
    }) as typeof fakeRes.write
    fakeRes.end = ((chunk?: unknown, _encoding?: unknown, cb?: unknown): ServerResponse => {
      if (chunk !== null && chunk !== undefined && typeof chunk !== 'function') {
        if (!rawChunks) { rawChunks = [] }
        rawChunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk as Buffer)
      }
      if (typeof chunk === 'function') { (chunk as () => void)() }
      else if (typeof cb === 'function') { (cb as () => void)() }
      return fakeRes
    }) as typeof fakeRes.end

    const response = new this.ResponseClass(
      fakeRes, fakeReq, this.logger, this.opts?.defaultHeaders, true,
    )

    // Pre-read body if present
    let bodyBuffer: Buffer | undefined
    if (request.body) {
      bodyBuffer = Buffer.from(await request.bytes())
    }

    const ctxOptions = this.eventContextOptions
    const requestLimits = this.opts?.requestLimits

    return createHttpContext(
      ctxOptions,
      { req: fakeReq, response, requestLimits },
      async () => {
        const ctx = current()

        // Seed body (same pattern as prepareTestHttpContext)
        if (bodyBuffer) {
          ctx.set(rawBodySlot, Promise.resolve(bodyBuffer))
        }

        try {
          // Route lookup (seeds routeParams into ctx via wooks.lookupHandlers)
          const handlers = this.wooks.lookupHandlers(method, pathname, ctx)

          if (handlers) {
            const result = this.processHandlers(handlers, ctx, response)
            // Wait for async handlers to complete
            if (result !== null && result !== undefined && typeof (result as Promise<unknown>).then === 'function') {
              await result.catch((error: unknown) => {
                if (!response.responded) {
                  this.respond(error, response, ctx)
                }
              })
            }
          } else {
            // No route matched — return null so callers
            // (e.g. Vite SSR middleware) can pass through to the next handler
            return null
          }
        } finally {
          // Emit 'end' then 'close' on the fake request — critical for Moost's
          // manualUnscope pattern where handlers bind raw.on('end', unscope).
          // Order matches real Node.js HTTP: 'end' when data consumed, 'close' after socket.
          fakeReq.emit('end')
          fakeReq.emit('close')
          fakeReq.destroy()
          fakeRes.destroy()
        }

        // If handler used getRawRes() and wrote directly, build from captured data.
        // Otherwise use the normal HttpResponse capture path.
        let webResponse: Response
        if (rawChunks || rawStatusCode > 0) {
          const body = rawChunks ? Buffer.concat(rawChunks) : null
          webResponse = new Response(body && body.length > 0 ? body : null, {
            status: rawStatusCode || 200,
            headers: rawHeaders ? recordToWebHeaders(rawHeaders) : undefined,
          })
        } else {
          webResponse = response.toWebResponse()
        }

        // Auto-propagate set-cookie headers to the parent response
        // so session cookies set by inner API calls reach the browser
        if (callerReq) {
          try {
            const parentResponse = callerCtx?.get(httpKind.keys.response)
            if (parentResponse) {
              for (const cookie of webResponse.headers.getSetCookie()) {
                parentResponse.setCookieRaw(cookie)
              }
            }
          } catch {
            // Parent context has no response slot (e.g. workflow/CLI context)
          }
        }

        return webResponse
      },
    )
  }

  /**
   * Convenience wrapper for programmatic route invocation.
   * Accepts a URL string (relative paths auto-prefixed with `http://localhost`),
   * URL object, or Request, plus optional `RequestInit`.
   *
   * @param input - URL string, URL object, or Request.
   * @param init - Optional RequestInit (method, headers, body, etc.).
   * @returns A Web Standard Response.
   */
  request(input: string | URL | Request, init?: RequestInit): Promise<Response | null> {
    if (typeof input === 'string' && !input.startsWith('http://') && !input.startsWith('https://')) {
      input = `http://localhost${input.startsWith('/') ? '' : '/'}${input}`
    }
    const req = input instanceof Request ? input : new Request(input, init)
    return this.fetch(req)
  }
}

// Minimal socket stand-in for programmatic fetch — avoids per-request Socket allocation.
// Must extend Duplex so IncomingMessage._destroy's eos() call accepts it as a Stream.
class NoopSocket extends Duplex {
  readonly remoteAddress = '127.0.0.1'
  _read(): void { /* noop */ }
  _write(_chunk: unknown, _enc: string, cb: () => void): void { cb() }
}
const NOOP_SOCKET = new NoopSocket() as unknown as ConstructorParameters<typeof IncomingMessage>[0]

function createFakeIncomingMessage(
  request: Request,
  pathname: string,
  forwardFrom?: IncomingMessage,
  forwardHeaders?: string[] | false,
): IncomingMessage {
  const req = new IncomingMessage(NOOP_SOCKET)
  req.method = request.method
  req.url = pathname

  // Start with forwarded headers from calling context (if any)
  const headers: Record<string, string> = {}
  if (forwardFrom && forwardHeaders !== false) {
    const headerList = Array.isArray(forwardHeaders)
      ? forwardHeaders
      : DEFAULT_FORWARD_HEADERS
    for (const h of headerList) {
      const val = forwardFrom.headers[h]
      if (typeof val === 'string' && val) {
        headers[h] = val
      }
    }
  }

  // Programmatic Request headers take precedence
  for (const [key, value] of request.headers) {
    headers[key] = value
  }

  req.headers = headers
  return req
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
