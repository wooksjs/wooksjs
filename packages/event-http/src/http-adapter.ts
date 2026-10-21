import type { TConsoleBase } from '@prostojs/logger'
import { current, run, setLocaleResolver, tryGetCurrent, useLocale } from '@wooksjs/event-core'
import type { EventContext, EventContextOptions, EventKindSeeds } from '@wooksjs/event-core'
import { Buffer } from 'buffer'
import http, { IncomingMessage, ServerResponse } from 'http'
import type { Server } from 'http'
import type { ListenOptions } from 'net'
import { Duplex } from 'stream'
import type { TWooksHandler, TWooksOptions, Wooks, WooksUpgradeHandler } from 'wooks'
import { WooksAdapterBase } from 'wooks'

import { forwardedSlot, seedRawBody } from './composables/request'
import { HttpError } from './errors'
import { createHttpContext } from './event-http'
import { httpAppConfigKey } from './http-config'
import type { THttpAppConfig, TTransformErrorBody } from './http-config'
import { httpKind } from './http-kind'
import { lowerCaseHeaders } from './response/header-keys'
import type { THttpCompressionOptions, TResolvedHttpCompression } from './response/compression'
import { resolveCompression } from './response/compression'
import type { HttpResponse } from './response/http-response'
import { recordToWebHeaders } from './response/http-response'
import { WooksHttpResponse } from './response/wooks-http-response'
import type { TRequestLimits } from './types'
import { compileTrustProxy } from './utils/proxy'
import type { TForwardedInfo, TProxyHeaders, TTrustProxy } from './utils/proxy'

/**
 * Identity headers forwarded from the calling HTTP context during programmatic `fetch()`
 * when no `forwardHeaders` option is configured.
 *
 * The `forwardHeaders` option REPLACES this list. To extend it instead, spread the constant:
 * ```ts
 * createHttpApp({ forwardHeaders: [...DEFAULT_FORWARD_HEADERS, 'cloudfront-viewer-address'] })
 * ```
 */
export const DEFAULT_FORWARD_HEADERS: readonly string[] = Object.freeze([
  'authorization',
  'cookie',
  'accept-language',
  'x-forwarded-for',
  'x-request-id',
])

/** Configuration options for the WooksHttp adapter. */
export interface TWooksHttpOptions {
  logger?: TConsoleBase
  onNotFound?: TWooksHandler
  router?: TWooksOptions['router']
  /** Default request body limits applied to every request (overridable per-request via `useRequest()`). */
  requestLimits?: Omit<TRequestLimits, 'perRequest'>
  /** Custom HttpResponse subclass. Defaults to WooksHttpResponse (HTML/JSON/text error rendering). */
  responseClass?: typeof WooksHttpResponse
  /**
   * Default headers applied to every response. Use `securityHeaders()` for recommended security
   * headers. Read once, when the app is created (later changes to the object are not seen).
   */
  defaultHeaders?: Record<string, string | string[]>
  /**
   * Headers forwarded from the calling HTTP context during programmatic `fetch()`.
   * REPLACES the default list entirely — to add headers while keeping the defaults,
   * spread the exported constant: `[...DEFAULT_FORWARD_HEADERS, 'my-header']`.
   * Set to `false` to disable forwarding entirely.
   * @default DEFAULT_FORWARD_HEADERS — ['authorization', 'cookie', 'accept-language', 'x-forwarded-for', 'x-request-id']
   */
  forwardHeaders?: string[] | false
  /**
   * Compresses regular response bodies (JSON, text, HTML, …) with brotli or gzip, negotiated
   * from the request's `Accept-Encoding`. Off by default. `true` uses the defaults
   * (`threshold: 1024`, `encodings: ['br', 'gzip']`, `brotliQuality: 4`, `gzipLevel: 6`);
   * an object overrides them. Streams, fetch `Response` bodies and programmatic `fetch()`
   * responses are never compressed. Opt a single response out with
   * `useResponse().setCompression(false)`.
   *
   * Do not enable it for responses that mix secrets with attacker-controlled input (BREACH).
   * @default false
   */
  compression?: boolean | THttpCompressionOptions
  /**
   * Which reverse proxies to trust for the client's IP, protocol and host
   * (`useRequest().getIp()` / `protocol()` / `host()`). Off by default: forwarding headers
   * are ignored and the client is the socket peer.
   *
   * - a number — trust that many hops (`1` = one reverse proxy: nginx, Caddy, a load balancer);
   * - a list — trust hops whose address matches (`['10.0.0.0/8', 'loopback']`);
   * - `(addr, hopIndex) => boolean` — custom (`hopIndex` 0 is the socket peer).
   *
   * The client is the right-most hop that is not trusted. Only enable it when every request
   * reaches the app through those proxies — otherwise a client can forge its address.
   * @default false
   */
  trustProxy?: TTrustProxy
  /**
   * The forwarding headers your trusted proxies write: `'x-forwarded'` (`X-Forwarded-For` /
   * `-Proto` / `-Host`) or `'forwarded'` (RFC 7239). Only that family is read.
   * @default 'x-forwarded'
   */
  proxyHeaders?: TProxyHeaders
  /**
   * Transforms every error body before it is rendered (JSON, HTML or text): thrown or returned
   * `HttpError`s, other errors (rendered as 500) and the router's 404. Use it to translate
   * `message` from `code` + `params`, or to strip fields. Must be synchronous; if it throws,
   * the error is logged and the original body is sent.
   *
   * @example
   * ```ts
   * createHttpApp({
   *   transformErrorBody: (body) =>
   *     body.code ? { ...body, message: t(useLocale().get(), body.code, body.params) } : body,
   * })
   * ```
   */
  transformErrorBody?: TTransformErrorBody
  /**
   * Your locale policy, as a function: it runs lazily, on the first `useLocale().get()` of a
   * request (and its child events, e.g. a workflow it starts), at most once per request.
   * Typically a `?lang` query or a cookie first, then `useAcceptLanguage().negotiate(...)`
   * (which also adds `Vary: Accept-Language`). Wooks never translates — it only carries the locale.
   *
   * @example
   * ```ts
   * createHttpApp({
   *   resolveLocale: () =>
   *     useCookies().getCookie('lang') ?? useAcceptLanguage().negotiate(['en', 'de'], 'en'),
   * })
   * ```
   */
  resolveLocale?: () => string | undefined
}

/** HTTP adapter for Wooks that provides route registration, server lifecycle, and request handling. */
export class WooksHttp extends WooksAdapterBase {
  protected logger: TConsoleBase
  protected ResponseClass: typeof WooksHttpResponse
  protected eventContextOptions: EventContextOptions
  protected compression: TResolvedHttpCompression | undefined
  /** App settings composables read per request; `undefined` when every one is at its default. */
  protected appConfig: THttpAppConfig | undefined
  /** `opts.defaultHeaders` keyed by lower-case name — snapshotted at creation. */
  protected defaultHeaders: Record<string, string | string[]> | undefined
  /** `opts.resolveLocale`, read once. */
  protected resolveLocale: (() => string | undefined) | undefined

  constructor(
    protected opts?: TWooksHttpOptions,
    wooks?: Wooks | WooksAdapterBase,
  ) {
    super(wooks, opts?.logger, opts?.router)
    this.logger = opts?.logger || this.getLogger(`${__DYE_CYAN_BRIGHT__}[wooks-http]`)
    this.ResponseClass = opts?.responseClass ?? WooksHttpResponse
    this.eventContextOptions = this.getEventContextOptions()
    this.compression = resolveCompression(opts?.compression)
    this.defaultHeaders = opts?.defaultHeaders && lowerCaseHeaders(opts.defaultHeaders)
    this.resolveLocale = opts?.resolveLocale
    const trustProxy = compileTrustProxy(opts?.trustProxy)
    const proxyHeaders = opts?.proxyHeaders ?? 'x-forwarded'
    if (proxyHeaders !== 'x-forwarded' && proxyHeaders !== 'forwarded') {
      throw new TypeError(
        `proxyHeaders: expected 'x-forwarded' or 'forwarded', got '${String(proxyHeaders)}'`,
      )
    }
    if (trustProxy || proxyHeaders !== 'x-forwarded' || opts?.transformErrorBody) {
      this.appConfig = Object.freeze({
        trustProxy,
        proxyHeaders,
        transformErrorBody: opts?.transformErrorBody,
      })
    }
  }

  /** Seeds the app settings (and the locale resolver) into a new HTTP event context. */
  protected applyAppConfig(ctx: EventContext): void {
    if (this.appConfig) {
      ctx.set(httpAppConfigKey, this.appConfig)
    }
    if (this.resolveLocale) {
      setLocaleResolver(ctx, this.resolveLocale)
    }
  }

  /** Runs `fn` in a new HTTP event context seeded with `seeds` and the app settings. */
  private createContext<R>(
    seeds: EventKindSeeds<typeof httpKind>,
    fn: (ctx: EventContext) => R,
  ): R {
    return createHttpContext(this.eventContextOptions, seeds, () => {
      const ctx = current()
      this.applyAppConfig(ctx)
      return fn(ctx)
    })
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
   *
   * Pass `onNoMatch` to mount Wooks as a middleware in front of another handler
   * (e.g. a Vite dev server). The request is routed first; when no route matches,
   * `onNoMatch(req, res)` is called directly — before and outside any event context:
   * no response wrapper is created, no event starts (`current()` throws, no
   * `ContextInjector` hooks fire) and `onNotFound` is skipped.
   */
  getServerCb(onNoMatch?: (req: IncomingMessage, res: ServerResponse) => void) {
    const logger = this.eventContextOptions.logger
    const RequestLimits = this.opts?.requestLimits
    const notFoundHandler = this.opts?.onNotFound
    const defaultHeaders = this.defaultHeaders
    const compression = this.compression

    return (req: IncomingMessage, res: ServerResponse) => {
      const method = req.method || ''
      const url = req.url || ''
      // Route before creating anything: in middleware mode unmatched requests belong to the host app
      const match = this.wooks.matchRoute(method, url)
      if (!match && onNoMatch) {
        onNoMatch(req, res)
        return
      }
      const response = new this.ResponseClass(res, req, logger, defaultHeaders, false, compression)

      this.createContext({ req, response, requestLimits: RequestLimits }, (ctx) => {
        const handlers = this.wooks.applyRoute(method, match, ctx)
        if (handlers) {
          return this.processAndCatch(handlers, ctx, response)
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
    const requestLimits = this.opts?.requestLimits
    const wsHandler = this.wsHandler

    return (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      if (!wsHandler) {
        socket.destroy()
        return
      }

      const url = req.url || ''

      this.createContext({ req, response: undefined, requestLimits }, (ctx) => {
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
    // The handler at `startIndex` already returned `promise`; later handlers are called here.
    for (let i = startIndex; i < handlers.length; i++) {
      try {
        const result = await (i === startIndex ? promise : (handlers[i]() as Promise<unknown>))
        // respond() returns a promise only for streamed or compressed bodies — skip the extra tick otherwise
        const sent = this.respond(result, response, ctx)
        if (sent) {
          await sent
        }
        return result
      } catch (error) {
        if (!(error instanceof HttpError)) {
          this.logger.error(
            `Uncaught route handler exception: ${ctx.get(httpKind.keys.req)?.url || ''}`,
            error,
          )
        }
        if (i === handlers.length - 1) {
          const sent = this.respond(error, response, ctx)
          if (sent) {
            await sent
          }
          return error
        }
      }
    }
  }

  /**
   * Programmatic route invocation using the Web Standard fetch API.
   * Goes through the full dispatch pipeline: route matching, context creation,
   * handler execution, response finalization. An unmatched route returns `null`
   * before any event context is created (the request body is left unread).
   *
   * When called from within an existing event context (e.g. during SSR), identity headers
   * (authorization, cookie) are forwarded from the calling request unless already present on
   * the given Request, and the inner request inherits the caller's resolved client
   * (`getIp()` / `protocol()` / `host()`) and locale (`useLocale()`).
   *
   * With no caller (a fetch runtime: Bun, Deno, edge), the peer is UNKNOWN unless passed in
   * `peer`: list and predicate `trustProxy` then trust nothing (a hop count still trusts
   * whatever sits in front), and `protocol()` / `host()` come from the Request URL.
   *
   * @param request - A Web Standard Request object.
   * @param peer - The connection's peer, when the runtime knows it: `remoteAddress` (the
   *   client's or the front proxy's address) and `encrypted` (TLS; default: the URL scheme).
   * @returns A Web Standard Response, or `null` if no route matched (`onNotFound` is not used here).
   */
  async fetch(request: Request, peer?: TFetchPeer): Promise<Response | null> {
    const url = new URL(request.url)
    const method = request.method
    const pathname = url.pathname + url.search

    // Route first: an unmatched request returns null without creating a request, response or
    // event context (and without consuming the request body)
    const match = this.wooks.matchRoute(method, pathname)
    if (!match) {
      return null
    }

    // Detect calling context for header forwarding
    const callerCtx = tryGetCurrent()
    let callerReq: IncomingMessage | undefined
    let callerForwarded: TForwardedInfo | undefined
    if (callerCtx) {
      try {
        callerReq = callerCtx.get(httpKind.keys.req)
      } catch {
        // Not in an HTTP context — skip forwarding
      }
      if (callerReq) {
        callerForwarded = callerCtx.get(forwardedSlot)
      }
    }

    // Build synthetic Node.js request
    const fakeReq = createFakeIncomingMessage(
      request,
      url,
      pathname,
      callerReq,
      this.opts?.forwardHeaders,
      peer,
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
      fakeRes, fakeReq, this.logger, this.defaultHeaders, true,
    )

    // Pre-read body if present
    let bodyBuffer: Buffer | undefined
    if (request.body) {
      bodyBuffer = Buffer.from(await request.bytes())
    }

    const requestLimits = this.opts?.requestLimits

    return this.createContext(
      { req: fakeReq, response, requestLimits },
      async (ctx) => {
        if (callerForwarded) {
          // An in-process request made on behalf of the caller's client (SSR self-fetch):
          // it gets the caller's resolved client, not the in-memory socket's.
          ctx.setOwn(forwardedSlot, callerForwarded)
        }
        if (callerCtx) {
          // ...and the caller's locale, when it has one (else this app's own policy)
          const own = this.resolveLocale
          setLocaleResolver(ctx, () => run(callerCtx, () => useLocale(callerCtx).get()) ?? own?.())
        }

        if (bodyBuffer) {
          seedRawBody(ctx, bodyBuffer)
        }

        try {
          // Seeds routeParams into ctx and fires the routed hook
          const handlers = this.wooks.applyRoute(method, match, ctx)
          const result = this.processHandlers(handlers, ctx, response)
          // Wait for async handlers to complete
          if (result !== null && result !== undefined && typeof (result as Promise<unknown>).then === 'function') {
            await result.catch((error: unknown) => {
              if (!response.responded) {
                this.respond(error, response, ctx)
              }
            })
          }
        } finally {
          // Emit 'end' then 'close' on the fake request and close the fake response,
          // matching real Node.js HTTP — listeners tied to request/response completion
          // (e.g. Moost's event-scope release on the response 'close') still fire.
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

  /**
   * Runs `fn` inside an HTTP event context seeded from a real `(req, res)` pair,
   * WITHOUT route dispatch. Composables that read request state (`useRequest`,
   * `useHeaders`, `useCookies`, `useAuthorization`) work; route-scoped state is empty.
   * Nested `fetch()` calls made during `fn` see this context as their caller,
   * so `forwardHeaders` and parent `Set-Cookie` propagation apply.
   *
   * Never writes to `res` — the caller owns the wire. The response wrapper is
   * created in capture mode, so even a stray `response.send()` inside `fn` only
   * finalizes state without touching the socket. Buffered response state
   * (e.g. `Set-Cookie` collected from nested fetches) can be applied by the
   * caller via the returned wrapper:
   * ```ts
   * const { result: html, response } = await http.withHttpContext(req, res, () => render(url))
   * for (const cookie of response.getSetCookieStrings()) {
   *   res.appendHeader('Set-Cookie', cookie)
   * }
   * ```
   */
  async withHttpContext<T>(
    req: IncomingMessage,
    res: ServerResponse,
    fn: () => T,
  ): Promise<{ result: Awaited<T>; response: HttpResponse }> {
    const response = new this.ResponseClass(
      res, req, this.eventContextOptions.logger, this.defaultHeaders, true,
    )
    const result = await this.createContext(
      { req, response, requestLimits: this.opts?.requestLimits },
      () => fn(),
    )
    return { result, response }
  }
}

/** The connection peer of a programmatic `fetch()`, when the runtime knows it. */
export interface TFetchPeer {
  /** Address of the connection's peer (the client, or the proxy in front). */
  remoteAddress?: string
  /** Whether the connection is TLS (default: the Request URL is `https:`). */
  encrypted?: boolean
}

// Minimal socket stand-in for programmatic fetch. The peer is unknown unless the caller passes
// one: an invented address would be trusted by an address-based `trustProxy`.
// Must extend Duplex so IncomingMessage._destroy's eos() call accepts it as a Stream.
class NoopSocket extends Duplex {
  constructor(
    readonly remoteAddress: string | undefined,
    readonly encrypted: boolean,
  ) {
    super()
  }
  _read(): void {
    /* noop */
  }
  _write(_chunk: unknown, _enc: string, cb: () => void): void {
    cb()
  }
}
type TSocketArg = ConstructorParameters<typeof IncomingMessage>[0]
// Shared stand-ins for the common case (no peer given) — avoids per-request allocation.
const NOOP_SOCKET = new NoopSocket(undefined, false) as unknown as TSocketArg
const NOOP_TLS_SOCKET = new NoopSocket(undefined, true) as unknown as TSocketArg

function createFakeIncomingMessage(
  request: Request,
  url: URL,
  pathname: string,
  forwardFrom?: IncomingMessage,
  forwardHeaders?: string[] | false,
  peer?: TFetchPeer,
): IncomingMessage {
  const encrypted = peer?.encrypted ?? url.protocol === 'https:'
  const socket = peer?.remoteAddress
    ? (new NoopSocket(peer.remoteAddress, encrypted) as unknown as TSocketArg)
    : encrypted
      ? NOOP_TLS_SOCKET
      : NOOP_SOCKET
  const req = new IncomingMessage(socket)
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
  // Like a real request: the Host the URL names
  if (!headers.host && url.host) {
    headers.host = url.host
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
