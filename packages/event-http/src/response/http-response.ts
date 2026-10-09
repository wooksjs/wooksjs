import type { EventContext, Logger } from '@wooksjs/event-core'
import type { IncomingMessage, ServerResponse } from 'http'
import { pipeline, Readable } from 'stream'
import type { ReadableStream as NodeReadableStream } from 'stream/web'

import type { HttpError, TWooksErrorBodyExt } from '../errors/http-error'
import type { TCookieAttributes, TSetCookieData } from '../types'
import type { TCacheControl } from '../utils/cache-control'
import { renderCacheControl } from '../utils/cache-control'
import { renderCookie } from '../utils/set-cookie'
import type {
  THttpCompressionEncoding,
  THttpCompressionOptions,
  TResolvedHttpCompression,
} from './compression'
import {
  compressionCacheKey,
  compressResponseBody,
  mergeVary,
  negotiateEncoding,
  resolveCompression,
} from './compression'
import { getPrerenderedJson, ifNoneMatchHas } from './prerender'
import type { TPrerendered } from './prerender'
import { EHttpStatusCode } from '../utils/status-codes'
import type { TTimeMultiString } from '../utils/time'
import { convertTime } from '../utils/time'

const hasFetchResponse = typeof globalThis.Response === 'function'

const defaultStatus: Record<string, EHttpStatusCode> = {
  GET: EHttpStatusCode.OK,
  POST: EHttpStatusCode.Created,
  PUT: EHttpStatusCode.Created,
  PATCH: EHttpStatusCode.Accepted,
  DELETE: EHttpStatusCode.Accepted,
}

/**
 * Manages response status, headers, cookies, cache control, and body for an HTTP request.
 *
 * All header mutations are accumulated in memory and flushed in a single `writeHead()` call
 * when `send()` is invoked. Setter methods are chainable.
 *
 * @example
 * ```ts
 * const response = useResponse()
 * response.setStatus(200).setHeader('x-custom', 'value')
 * response.setCookie('session', 'abc', { httpOnly: true })
 * ```
 */
export class HttpResponse {
  /**
   * @param _res - The underlying Node.js `ServerResponse`.
   * @param _req - The underlying Node.js `IncomingMessage`.
   * @param _logger - Logger instance for error reporting.
   * @param defaultHeaders - Optional headers to pre-populate on this response (e.g. from `securityHeaders()`).
   * @param _captureMode - Finalize state on `send()` without writing to `_res` (programmatic fetch).
   * @param compression - App-level response compression settings (`undefined` = off).
   */
  constructor(
    protected readonly _res: ServerResponse,
    protected readonly _req: IncomingMessage,
    protected readonly _logger: Logger,
    defaultHeaders?: Record<string, string | string[]>,
    protected readonly _captureMode = false,
    compression?: TResolvedHttpCompression,
  ) {
    this._compression = compression
    if (defaultHeaders) {
      for (const key in defaultHeaders) {
        this._headers[key] = defaultHeaders[key]
      }
    }
  }

  protected _status: EHttpStatusCode = 0 as EHttpStatusCode
  protected _body: unknown = undefined
  protected _headers: Record<string, string | string[]> = {}
  /** Outgoing named cookies — allocated on the first `setCookie()`. */
  protected _cookies?: Record<string, TSetCookieData>
  /** Outgoing raw `Set-Cookie` strings — allocated on the first `setCookieRaw()`. */
  protected _rawCookies?: string[]
  protected _hasCookies = false
  protected _responded = false
  /** Registry entry of the prerendered body picked by the last `renderBody()` (see `prerenderJson`). */
  private _prerendered?: TPrerendered
  /** Effective compression settings for this response (`undefined` = off). */
  protected _compression: TResolvedHttpCompression | undefined

  // --- Status ---

  /** The HTTP status code. If not set, it is inferred automatically when `send()` is called. */
  get status(): EHttpStatusCode {
    return this._status
  }

  set status(value: EHttpStatusCode) {
    this._status = value
  }

  /** Sets the HTTP status code (chainable). */
  setStatus(value: EHttpStatusCode): this {
    this._status = value
    return this
  }

  // --- Body ---

  /** The response body. Automatically serialized by `send()` (objects → JSON, strings → text). */
  get body(): unknown {
    return this._body
  }

  set body(value: unknown) {
    this._body = value
  }

  /** Sets the response body (chainable). */
  setBody(value: unknown): this {
    this._body = value
    return this
  }

  // --- Headers ---

  /** Sets a single response header (chainable). Arrays produce multi-value headers. */
  setHeader(name: string, value: string | number | string[]): this {
    this._headers[name] = Array.isArray(value) ? value : value.toString()
    return this
  }

  /** Batch-sets multiple response headers from a record (chainable). Existing keys are overwritten. */
  setHeaders(headers: Record<string, string | string[]>): this {
    for (const key in headers) {
      this._headers[key] = headers[key]
    }
    return this
  }

  /** Returns the value of a response header, or `undefined` if not set. */
  getHeader(name: string): string | string[] | undefined {
    return this._headers[name]
  }

  /** Removes a response header (chainable). */
  removeHeader(name: string): this {
    delete this._headers[name]
    return this
  }

  /** Returns a read-only snapshot of all response headers. */
  headers(): Readonly<Record<string, string | string[]>> {
    return this._headers
  }

  /** Sets the `Content-Type` response header (chainable). */
  setContentType(value: string): this {
    this._headers['content-type'] = value
    return this
  }

  /** Returns the current `Content-Type` header value. */
  getContentType(): string | string[] | undefined {
    return this._headers['content-type']
  }

  /** Sets the `Access-Control-Allow-Origin` header (chainable). Defaults to `'*'`. */
  enableCors(origin = '*'): this {
    this._headers['access-control-allow-origin'] = origin
    return this
  }

  // --- Cookies (outgoing set-cookie) ---

  /** Sets an outgoing `Set-Cookie` header with optional attributes (chainable). */
  setCookie(name: string, value: string, attrs?: Partial<TCookieAttributes>): this {
    ;(this._cookies ??= {})[name] = { value, attrs: attrs || {} }
    this._hasCookies = true
    return this
  }

  /** Returns a previously set cookie's data, or `undefined` if not set. */
  getCookie(name: string): TSetCookieData | undefined {
    return this._cookies?.[name]
  }

  /** Removes a cookie from the outgoing set list (chainable). */
  removeCookie(name: string): this {
    if (this._cookies) {
      delete this._cookies[name]
    }
    return this
  }

  /** Removes all outgoing cookies (chainable). */
  clearCookies(): this {
    this._cookies = undefined
    this._rawCookies = undefined
    this._hasCookies = false
    return this
  }

  /** Appends a raw `Set-Cookie` header string (chainable). Use when you need full control over the cookie format. */
  setCookieRaw(rawValue: string): this {
    ;(this._rawCookies ??= []).push(rawValue)
    this._hasCookies = true
    return this
  }

  /**
   * Renders all buffered cookies (named via `setCookie()`, then raw via `setCookieRaw()`)
   * as `Set-Cookie` header strings, without responding.
   *
   * Non-destructive: the buffers stay intact, so a later `send()` still emits the same
   * cookies — callers that drain cookies onto the wire themselves should not also send
   * through this wrapper. Cookies placed directly into headers (via `setHeader('set-cookie', …)`
   * or default headers) are not included.
   */
  getSetCookieStrings(): string[] {
    const rendered: string[] = []
    if (this._cookies) {
      for (const [name, data] of Object.entries(this._cookies)) {
        if (data) {
          rendered.push(renderCookie(name, data))
        }
      }
    }
    if (this._rawCookies) {
      rendered.push(...this._rawCookies)
    }
    return rendered
  }

  // --- Cache control ---

  /** Sets the `Cache-Control` header from a directive object (chainable). */
  setCacheControl(data: TCacheControl): this {
    this._headers['cache-control'] = renderCacheControl(data)
    return this
  }

  /** Sets the `Age` header in seconds (chainable). Accepts a number or time string (e.g. `'2h 15m'`). */
  setAge(value: number | TTimeMultiString): this {
    this._headers.age = convertTime(value, 's').toString()
    return this
  }

  /** Sets the `Expires` header (chainable). Accepts a `Date`, date string, or timestamp. */
  setExpires(value: Date | string | number): this {
    this._headers.expires =
      typeof value === 'string' || typeof value === 'number'
        ? new Date(value).toUTCString()
        : value.toUTCString()
    return this
  }

  /** Sets or clears the `Pragma: no-cache` header (chainable). */
  setPragmaNoCache(value = true): this {
    this._headers.pragma = value ? 'no-cache' : ''
    return this
  }

  // --- Compression ---

  /**
   * Overrides response compression for this response (chainable).
   *
   * - `false` — never compress this response (e.g. a body that mixes secrets with reflected input).
   * - `true` — compress with the app settings, or the defaults when the app has compression off.
   * - an options object — compress with these settings over the app settings (or the defaults).
   *
   * Only regular bodies (strings, numbers, booleans, objects, `Uint8Array`) are compressed; streams
   * and fetch `Response` bodies are sent as is.
   */
  setCompression(value: boolean | THttpCompressionOptions): this {
    this._compression =
      value === true
        ? (this._compression ?? resolveCompression(true))
        : resolveCompression(value, this._compression)
    return this
  }

  /** Effective compression settings for this response, or `false` when compression is off. */
  get compression(): Readonly<TResolvedHttpCompression> | false {
    return this._compression ?? false
  }

  // --- Raw access & state ---

  /**
   * Returns the underlying Node.js `ServerResponse`.
   * @param passthrough - If `true`, the framework still manages the response lifecycle. If `false` (default), the response is marked as "responded" and the framework will not touch it.
   */
  getRawRes(passthrough?: boolean): ServerResponse {
    if (!passthrough) {
      this._responded = true
    }
    return this._res
  }

  /** Whether the response has already been sent (or the underlying stream is no longer writable). */
  get responded(): boolean {
    return this._responded || !this._res.writable || this._res.writableEnded
  }

  // --- Web Response (programmatic fetch) ---

  /**
   * Builds a Web Standard `Response` from the accumulated response state
   * (status, headers, cookies, body) without writing to the underlying `ServerResponse`.
   *
   * Used by `WooksHttp.fetch()` for programmatic invocation.
   */
  toWebResponse(): Response {
    this.finalizeCookies()

    const body = this._body
    const method = this._req.method

    // Stream body
    if (body instanceof Readable) {
      this.autoStatus(true)
      return new globalThis.Response(
        method === 'HEAD' ? null : Readable.toWeb(body) as ReadableStream,
        { status: this._status, headers: this._buildWebHeaders() },
      )
    }

    // Fetch Response passthrough
    if (hasFetchResponse && body instanceof globalThis.Response) {
      this._status = this._status || (body.status as EHttpStatusCode)
      this.mergeFetchResponseHeaders(body)
      return new globalThis.Response(
        method === 'HEAD' ? null : body.body,
        { status: this._status, headers: this._buildWebHeaders() },
      )
    }

    // Regular body — renderBody() may set content-type on this._headers.
    // Never compressed: the consumer is in-process (programmatic fetch / SSR).
    const rendered = this.renderBody()
    const prerendered = this.takePrerendered()
    this.autoStatus(!!rendered)
    if (prerendered?.etag && this.applyPrerenderedEtag(prerendered.etag)) {
      return new globalThis.Response(null, {
        status: this._status,
        headers: this._buildWebHeaders(),
      })
    }
    if (rendered) {
      this._headers['content-length'] = renderedSize(rendered, prerendered).toString()
    }

    const webBody = method === 'HEAD' ? null
      : rendered instanceof Uint8Array ? rendered.buffer as ArrayBuffer
      : rendered || null
    const webResponse = new globalThis.Response(
      webBody,
      { status: this._status, headers: this._buildWebHeaders() },
    )

    // Override text()/json() to return pre-computed values directly,
    // avoiding redundant stream reads and JSON.parse round-trips for in-process consumers
    if (typeof rendered === 'string' && rendered) {
      webResponse.text = () => Promise.resolve(rendered)
    }
    if (
      typeof body === 'object'
      && body !== null
      && !(body instanceof Uint8Array)
      && !(body instanceof Readable)
      && !(hasFetchResponse && body instanceof globalThis.Response)
    ) {
      const original = body
      webResponse.json = () => Promise.resolve(original)
    }

    return webResponse
  }

  private _buildWebHeaders(): Headers {
    return recordToWebHeaders(this._headers)
  }

  /**
   * Merges headers from a handler-returned fetch `Response` into the buffered headers.
   * Explicitly buffered headers win. `set-cookie` is appended in array form so multiple
   * cookies survive (`Headers` iteration would otherwise keep only the first).
   */
  protected mergeFetchResponseHeaders(fetchResponse: Response): void {
    fetchResponse.headers.forEach((value, key) => {
      if (key !== 'set-cookie' && !this._headers[key]) {
        this._headers[key] = value
      }
    })
    const setCookies = typeof fetchResponse.headers.getSetCookie === 'function'
      ? fetchResponse.headers.getSetCookie()
      : []
    if (setCookies.length > 0) {
      const existing = this._headers['set-cookie']
      this._headers['set-cookie'] = existing
        ? [...(Array.isArray(existing) ? existing : [existing]), ...setCookies]
        : setCookies
    }
  }

  // --- Rendering (overridable) ---

  protected renderBody(): string | Uint8Array {
    const body = this._body
    if (body === undefined || body === null) {
      return ''
    }
    if (typeof body === 'string') {
      if (!this._headers['content-type']) {
        this._headers['content-type'] = 'text/plain'
      }
      return body
    }
    if (typeof body === 'boolean' || typeof body === 'number') {
      if (!this._headers['content-type']) {
        this._headers['content-type'] = 'text/plain'
      }
      return body.toString()
    }
    if (body instanceof Uint8Array) {
      return body
    }
    if (typeof body === 'object') {
      if (!this._headers['content-type']) {
        this._headers['content-type'] = 'application/json'
      }
      const prerendered = getPrerenderedJson(body)
      if (prerendered) {
        this._prerendered = prerendered
        return prerendered.json
      }
      return JSON.stringify(body)
    }
    throw new Error(`Unsupported body format "${typeof body}"`)
  }

  protected renderError(data: TWooksErrorBodyExt, _ctx: EventContext): void {
    this._status = (data.statusCode || 500) as EHttpStatusCode
    this._headers['content-type'] = 'application/json'
    this._body = JSON.stringify(data)
  }

  // --- Sending ---

  /** Renders and sends an HTTP error response. Called automatically by the framework when a handler throws an `HttpError`. */
  sendError(error: HttpError, ctx: EventContext): void | Promise<void> {
    const data = error.body
    this.renderError(data, ctx)
    return this.send()
  }

  /**
   * Finalizes and sends the response.
   *
   * Flushes all accumulated headers (including cookies) in a single `writeHead()` call,
   * then writes the body. Supports `Readable` streams, `fetch` `Response` objects, and regular values.
   * Returns a Promise (which never rejects) for streamed bodies and compressed regular bodies.
   *
   * @throws Error if the response was already sent.
   */
  send(): void | Promise<void> {
    if (this._responded) {
      const err = new Error('The response was already sent.')
      this._logger.error(err.message, err)
      throw err
    }
    this._responded = true

    // Capture mode: finalize state but don't write to socket
    if (this._captureMode) {
      this.finalizeCookies()
      return
    }

    // Render cookies into headers
    this.finalizeCookies()

    const body = this._body
    const method = this._req.method

    // Branch A: Readable stream
    if (body instanceof Readable) {
      return this.sendStream(body, method)
    }

    // Branch B: Fetch Response
    if (hasFetchResponse && body instanceof Response) {
      return this.sendFetchResponse(body, method)
    }

    // Branch C: Regular body (synchronous — no Promise allocated unless compressing)
    return this.sendRegular(method)
  }

  private finalizeCookies(): void {
    if (!this._hasCookies) {
      return
    }
    const rendered = this.getSetCookieStrings()
    if (rendered.length > 0) {
      const existing = this._headers['set-cookie']
      if (existing) {
        this._headers['set-cookie'] = [
          ...(Array.isArray(existing) ? existing : [existing]),
          ...rendered,
        ]
      } else {
        this._headers['set-cookie'] = rendered
      }
    }
    this._hasCookies = false
  }

  /**
   * For a body registered with `prerenderJson(obj, { etag: true })`: sets the `ETag` header on a
   * GET/HEAD 2xx response (unless one was set explicitly) and turns a `200` whose `If-None-Match`
   * matches into a bodiless `304`. Returns `true` when the response became `304`.
   * Other methods get no ETag (a validator on e.g. a PUT response would describe the stored resource).
   */
  private applyPrerenderedEtag(etag: string): boolean {
    const method = this._req.method
    if (
      (method !== 'GET' && method !== 'HEAD') ||
      this._status < 200 ||
      this._status > 299 ||
      this.headerKeyIgnoreCase('etag') !== undefined
    ) {
      return false
    }
    this._headers.etag = etag
    if (
      this._status !== EHttpStatusCode.OK ||
      !ifNoneMatchHas(this._req.headers['if-none-match'], etag)
    ) {
      return false
    }
    this._status = EHttpStatusCode.NotModified
    for (const key in this._headers) {
      const lower = key.toLowerCase()
      if (lower === 'content-type' || lower === 'content-length') {
        delete this._headers[key]
      }
    }
    return true
  }

  /** Returns the stored key of header `name` (lower-case) in whatever casing it was set with. */
  private headerKeyIgnoreCase(name: string): string | undefined {
    if (name in this._headers) {
      return name
    }
    for (const key in this._headers) {
      if (key.toLowerCase() === name) {
        return key
      }
    }
    return undefined
  }

  /** Returns and clears the prerender entry picked by the last `renderBody()`. */
  private takePrerendered(): TPrerendered | undefined {
    const prerendered = this._prerendered
    this._prerendered = undefined
    return prerendered
  }

  private autoStatus(hasBody: boolean): void {
    if (this._status) {
      return
    }
    if (!hasBody) {
      this._status = EHttpStatusCode.NoContent
      return
    }
    this._status = defaultStatus[this._req.method as 'GET'] || EHttpStatusCode.OK
  }

  private sendStream(source: Readable, method: string | undefined): Promise<void> {
    this.autoStatus(true)
    this._res.writeHead(this._status, this._headers)
    if (method === 'HEAD') {
      source.destroy()
      this._res.end()
      return Promise.resolve()
    }
    return this.pipeToResponse(source, 'Stream error')
  }

  /**
   * Pipes `source` into the response. `pipeline` destroys the source when the RESPONSE
   * closes first (the client disconnected — the request's own 'close' fires as soon as its
   * body is read, so it can't signal that) and destroys the response when the source fails,
   * so a truncated body never looks complete. A source error is logged, never rethrown:
   * headers are already sent, and a sync handler's send() is not awaited (an unhandled
   * rejection would take the process down).
   */
  private pipeToResponse(source: Readable, errorLabel: string): Promise<void> {
    return new Promise((resolve) => {
      pipeline(source, this._res, (error) => {
        if (error && (error as NodeJS.ErrnoException).code !== 'ERR_STREAM_PREMATURE_CLOSE') {
          this._logger.error(errorLabel, error)
        }
        resolve()
      })
    })
  }

  private async sendFetchResponse(
    fetchResponse: Response,
    method: string | undefined,
  ): Promise<void> {
    // Use fetch status as fallback
    this._status = this._status || (fetchResponse.status as EHttpStatusCode)

    this.mergeFetchResponseHeaders(fetchResponse)

    this._res.writeHead(this._status, this._headers)

    if (method === 'HEAD' || !fetchResponse.body) {
      this._res.end()
      return
    }
    return this.pipeToResponse(
      Readable.fromWeb(fetchResponse.body as unknown as NodeReadableStream<Uint8Array>),
      'Error streaming fetch response body',
    )
  }

  private sendRegular(method: string | undefined): void | Promise<void> {
    const body = this.renderBody()
    const prerendered = this.takePrerendered()
    const size = renderedSize(body, prerendered)
    this.autoStatus(!!body)
    // Eligibility does not depend on the client: every eligible response varies on Accept-Encoding
    const compression =
      this._compression && this.isCompressible(size, this._compression)
        ? this._compression
        : undefined
    if (compression) {
      this.appendVary('Accept-Encoding')
    }
    if (prerendered?.etag && this.applyPrerenderedEtag(prerendered.etag)) {
      this._res.writeHead(this._status, this._headers).end()
      return
    }
    if (compression && method !== 'HEAD') {
      const encoding = negotiateEncoding(
        this._req.headers['accept-encoding'],
        compression.encodings,
      )
      if (encoding) {
        return this.sendCompressed(body, size, encoding, compression, prerendered)
      }
    }
    this._headers['content-length'] = size.toString()

    this._res.writeHead(this._status, this._headers).end(method === 'HEAD' ? '' : body)
  }

  /**
   * Whether a rendered regular body of `size` bytes may be compressed — independent of the
   * request's `Accept-Encoding` (and of HEAD, which is answered uncompressed).
   */
  private isCompressible(size: number, opts: TResolvedHttpCompression): boolean {
    const status = this._status
    if (
      !size ||
      size < opts.threshold ||
      status < 200 ||
      status === 204 ||
      status === 206 ||
      status === 304
    ) {
      return false
    }
    // One pass over the headers (keys keep the caller's casing)
    let contentType: string | string[] | undefined
    for (const key in this._headers) {
      const lower = key.toLowerCase()
      if (lower === 'content-type') {
        contentType = this._headers[key]
      } else if (lower === 'content-encoding') {
        return false
      } else if (lower === 'cache-control' && /no-transform/i.test(String(this._headers[key]))) {
        return false
      }
    }
    return typeof contentType === 'string' && opts.filter(contentType, this)
  }

  /** Adds `token` to the `Vary` header (case-insensitive merge, keeps existing entries). */
  private appendVary(token: string): void {
    const key = this.headerKeyIgnoreCase('vary') ?? 'vary'
    const merged = mergeVary(this._headers[key], token)
    if (merged !== undefined) {
      this._headers[key] = merged
    }
  }

  /**
   * Sends the body compressed with `encoding`. Prerendered bodies are compressed once per coding
   * and level and the bytes reused (sent synchronously once ready). A compressor failure is
   * logged and the body is sent uncompressed — headers are not written yet, so that is safe.
   * Never rejects: a sync handler's `send()` is not awaited.
   */
  private sendCompressed(
    body: string | Uint8Array,
    size: number,
    encoding: THttpCompressionEncoding,
    opts: TResolvedHttpCompression,
    prerendered: TPrerendered | undefined,
  ): void | Promise<void> {
    let pending: Buffer | Promise<Buffer>
    // An overridden renderBody() may send something other than the registered JSON — don't cache it
    if (prerendered?.json === body) {
      const cache = (prerendered.compressed ??= {})
      const cacheKey = compressionCacheKey(encoding, opts)
      let entry = cache[cacheKey]
      if (!entry) {
        const promise = compressResponseBody(body, size, encoding, opts)
        // Swap the settled bytes in so later responses write synchronously; drop a failure
        promise.then(
          (bytes) => (cache[cacheKey] = bytes),
          () => delete cache[cacheKey],
        )
        entry = cache[cacheKey] = promise
      }
      pending = entry
    } else {
      pending = compressResponseBody(body, size, encoding, opts)
    }
    if (Buffer.isBuffer(pending)) {
      this.writeDeferred(pending, pending.byteLength, encoding)
      return
    }
    return pending
      .then(
        (bytes) => this.writeDeferred(bytes, bytes.byteLength, encoding),
        (error: unknown) => {
          this._logger.error('Response compression failed, sending uncompressed body', error)
          this.writeDeferred(body, size)
        },
      )
      .catch((error: unknown) => {
        this._logger.error('Failed to send compressed response', error)
      })
  }

  /**
   * Writes the body picked by `sendCompressed()` — the `encoding`-compressed bytes, or the identity
   * body after a compressor failure — unless the client went away meanwhile.
   */
  private writeDeferred(
    body: string | Uint8Array,
    length: number,
    encoding?: THttpCompressionEncoding,
  ): void {
    if (this._res.destroyed) {
      return
    }
    if (encoding) {
      this._headers['content-encoding'] = encoding
      for (const key in this._headers) {
        const lower = key.toLowerCase()
        if (lower === 'content-length' && key !== lower) {
          // An explicit identity length in another casing would go out as a second, wrong header
          delete this._headers[key]
        } else if (lower === 'etag') {
          // A strong validator promises byte-identical bodies; the encoded body is not, so weaken it
          const etag = this._headers[key]
          if (typeof etag === 'string' && etag && !etag.startsWith('W/')) {
            this._headers[key] = `W/${etag}`
          }
        }
      }
    }
    this._headers['content-length'] = length.toString()
    this._res.writeHead(this._status, this._headers).end(body)
  }
}

/** UTF-8 size of a rendered body — computed once per registration for a prerendered body. */
function renderedSize(body: string | Uint8Array, prerendered: TPrerendered | undefined): number {
  if (typeof body !== 'string') {
    return body.byteLength
  }
  // An overridden renderBody() may send something other than the registered JSON
  return prerendered?.json === body
    ? (prerendered.size ??= Buffer.byteLength(body))
    : Buffer.byteLength(body)
}

/** Converts a Record of headers to a Web Standard `Headers` object. */
export function recordToWebHeaders(record: Record<string, string | string[]>): Headers {
  const headers = new Headers()
  for (const [key, value] of Object.entries(record)) {
    if (Array.isArray(value)) {
      for (const v of value) {
        headers.append(key, v)
      }
    } else if (value) {
      headers.set(key, value)
    }
  }
  return headers
}
