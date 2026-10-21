import { tryGetCurrent } from '@wooksjs/event-core'
import type { EventContext, Logger } from '@wooksjs/event-core'
import type { IncomingMessage, ServerResponse } from 'http'
import { pipeline, Readable } from 'stream'
import type { ReadableStream as NodeReadableStream } from 'stream/web'

import { HttpError } from '../errors/http-error'
import type { TWooksErrorBodyExt } from '../errors/http-error'
import { getHttpAppConfig } from '../http-config'
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
import { checkPreconditions, mayHaveConditional, toValidators } from './conditional'
import { foldHeaderKeys, isLowerCaseHeaders, lowerCaseRenderErrors } from './header-keys'
import { getPrerenderedJson } from './prerender'
import type { TPrerendered } from './prerender'
import { EHttpStatusCode } from '../utils/status-codes'
import type { TTimeMultiString } from '../utils/time'
import { toHeaderSeconds } from '../utils/time'

export { checkPreconditions, parseHttpDate } from './conditional'

const hasFetchResponse = typeof globalThis.Response === 'function'

/** Headers that describe the bytes of a returned fetch Response — they come from it, never the buffer. */
const BODY_BYTES_HEADERS = new Set(['content-length', 'content-encoding', 'content-range'])

/** Headers that describe the representation itself — not sent with a 304. */
const REPRESENTATION_HEADERS = new Set([
  'content-type',
  'content-length',
  'content-encoding',
  'content-language',
  'content-range',
  'content-md5',
])

/**
 * Status a response gets when the handler set none and there IS a body, by request method.
 * A method not listed gets `200`; a response without a body gets `204` whatever the method.
 * Use {@link getDefaultHttpStatus} to apply the full rule (e.g. to document responses).
 */
export const DEFAULT_HTTP_STATUS: Readonly<Record<string, EHttpStatusCode>> = Object.freeze({
  GET: EHttpStatusCode.OK,
  POST: EHttpStatusCode.Created,
  PUT: EHttpStatusCode.OK,
  PATCH: EHttpStatusCode.OK,
  DELETE: EHttpStatusCode.OK,
})

/**
 * The status a response gets when the handler set none: `204` without a body, otherwise
 * {@link DEFAULT_HTTP_STATUS} for the method (`201` for POST), `200` for any other method.
 */
export function getDefaultHttpStatus(
  method: string | undefined,
  hasBody: boolean,
): EHttpStatusCode {
  if (!hasBody) {
    return EHttpStatusCode.NoContent
  }
  return (method !== undefined && DEFAULT_STATUS_BY_METHOD[method]) || EHttpStatusCode.OK
}

/** {@link DEFAULT_HTTP_STATUS} without a prototype: one property read, no inherited keys. */
const DEFAULT_STATUS_BY_METHOD: Record<string, EHttpStatusCode | undefined> = Object.assign(
  Object.create(null) as Record<string, EHttpStatusCode | undefined>,
  DEFAULT_HTTP_STATUS,
)

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
   * @param defaultHeaders - Optional headers to pre-populate on this response (e.g. from
   *   `securityHeaders()`); copied, names folded to lower case.
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
    this._headers = defaultHeaders
      ? isLowerCaseHeaders(defaultHeaders)
        ? { ...defaultHeaders }
        : foldHeaderKeys(defaultHeaders)
      : {}
  }

  protected _status: EHttpStatusCode = 0 as EHttpStatusCode
  protected _body: unknown = undefined
  /**
   * Buffered response headers, keyed by LOWER-CASE name (header names are case-insensitive; one
   * key per header means one header line per name on the wire). Subclasses writing directly
   * should use lower-case keys; any other casing is folded in before the headers are written.
   */
  protected _headers: Record<string, string | string[]>
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
  /** Whether the request may carry a conditional header — settled once per send. */
  private _mayBeConditional = true
  /** Set by `sendError()` for the `send()` it makes: the header keys were just folded. */
  private _keysNormalized = false

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

  /**
   * Sets a single response header (chainable); names are case-insensitive — setting `ETag`
   * after `etag` replaces it. Arrays produce multi-value headers.
   */
  setHeader(name: string, value: string | number | string[]): this {
    this._headers[name.toLowerCase()] = Array.isArray(value) ? value : value.toString()
    return this
  }

  /** Batch-sets multiple response headers from a record (chainable). Existing headers are replaced, whatever their casing. */
  setHeaders(headers: Record<string, string | string[]>): this {
    for (const key in headers) {
      this._headers[key.toLowerCase()] = headers[key]
    }
    return this
  }

  /** Returns the value of a response header (name is case-insensitive), or `undefined` if not set. */
  getHeader(name: string): string | string[] | undefined {
    return this._headers[name.toLowerCase()]
  }

  /** Removes a response header (chainable; name is case-insensitive). */
  removeHeader(name: string): this {
    delete this._headers[name.toLowerCase()]
    return this
  }

  /** Returns a read-only snapshot of all response headers, keyed by lower-case name. */
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
    const cookies = this._cookies
    if (cookies) {
      for (const name of Object.keys(cookies)) {
        const data = cookies[name]
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

  /**
   * Sets the `Age` header (chainable). A number is **seconds**; a string carries its units
   * (`'2h 15m'`). Rendered as whole seconds, rounded down, clamped to 0–2147483648.
   */
  setAge(value: number | TTimeMultiString): this {
    this._headers.age = toHeaderSeconds(value)
    return this
  }

  /** Sets the `Expires` header (chainable). Accepts a `Date`, a date string, or a timestamp in **milliseconds**. */
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
    this.prepareForWrite()
    const body = this._body
    const method = this._req.method
    const head = method === 'HEAD'
    const respond = (webBody: BodyInit | null) =>
      new globalThis.Response(webBody, {
        status: this._status,
        headers: recordToWebHeaders(this._headers),
      })

    // Stream body
    if (body instanceof Readable) {
      this.autoStatus(true)
      if (this.applyConditional() || head) {
        discardBody(body)
        return respond(null)
      }
      return respond(Readable.toWeb(body) as ReadableStream)
    }

    // Fetch Response passthrough
    if (hasFetchResponse && body instanceof globalThis.Response) {
      this._status = this._status || (body.status as EHttpStatusCode)
      this.mergeFetchResponseHeaders(body)
      if (this.applyConditional() || head) {
        discardBody(body)
        return respond(null)
      }
      return respond(body.body)
    }

    // Regular body — never compressed: the consumer is in-process (programmatic fetch / SSR)
    const rendered = this.renderRegular(method)
    const prerendered = this.takePrerendered()
    const headLength = this.keepsHeadLength(method, rendered)
    if (this.applyConditional(prerendered?.etag)) {
      return respond(null)
    }
    if (rendered && !headLength) {
      this.setContentLength(renderedSize(rendered, prerendered))
    }
    this.dropBodilessLength()
    // a HEAD response has no body to read
    if (head) {
      return respond(null)
    }
    // the view itself — never its backing ArrayBuffer (a pooled Buffer shares a larger one)
    const webResponse = respond((rendered || null) as BodyInit | null)

    // Override text()/json() to return pre-computed values directly,
    // avoiding redundant stream reads and JSON.parse round-trips for in-process consumers
    if (typeof rendered === 'string' && rendered) {
      webResponse.text = () => Promise.resolve(rendered)
    }
    if (typeof body === 'object' && body !== null && !(body instanceof Uint8Array)) {
      webResponse.json = () => Promise.resolve(body)
    }
    return webResponse
  }

  /**
   * Merges headers from a handler-returned fetch `Response` into the buffered headers.
   * Explicitly buffered headers win — except the ones that describe the Response's own body
   * bytes (`Content-Length`, `Content-Encoding`, `Content-Range`): those always come from the
   * Response (a buffered length the Response does not confirm is dropped). `set-cookie` is
   * appended in array form so multiple cookies survive (`Headers` iteration would otherwise keep
   * only the first).
   */
  protected mergeFetchResponseHeaders(fetchResponse: Response): void {
    for (const name of BODY_BYTES_HEADERS) {
      delete this._headers[name]
    }
    fetchResponse.headers.forEach((value, key) => {
      if (key !== 'set-cookie' && (BODY_BYTES_HEADERS.has(key) || !this._headers[key])) {
        this._headers[key] = value
      }
    })
    const setCookies = typeof fetchResponse.headers.getSetCookie === 'function'
      ? fetchResponse.headers.getSetCookie()
      : []
    if (setCookies.length > 0) {
      this._headers['set-cookie'] = appendSetCookie(
        this._headers['set-cookie'] || undefined,
        setCookies,
      )
    }
  }

  // --- Rendering (overridable) ---

  protected renderBody(): string | Uint8Array {
    const body = this._body
    if (body === undefined || body === null) {
      return ''
    }
    if (typeof body === 'string') {
      // an empty body has no content type
      if (body && !this._headers['content-type']) {
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

  /**
   * Renders the error body `data` into this response (status, content type, body). Write
   * headers with lower-case names.
   */
  protected renderError(data: TWooksErrorBodyExt, _ctx: EventContext): void {
    this.renderPlainError(data)
  }

  /** A JSON error body — the default rendering, and the fallback when a renderer throws. */
  private renderPlainError(data: TWooksErrorBodyExt): void {
    this._status = (data.statusCode || 500) as EHttpStatusCode
    this._headers['content-type'] = 'application/json'
    this._body = JSON.stringify(data)
  }

  // --- Sending ---

  /**
   * Renders and sends an HTTP error response. Called automatically by the framework when a handler
   * throws (or returns) an error. See {@link prepareError} for what the response becomes.
   */
  sendError(error: HttpError, ctx: EventContext): void | Promise<void> {
    this.prepareError(error, ctx)
    // prepareError() left the header keys folded; send() need not fold them again
    this._keysNormalized = true
    return this.send()
  }

  /**
   * Turns the buffered response into the error response for `error` — the one path every
   * failure takes (thrown or returned errors, the router's 404, the automatic 412):
   * - a pending body (stream, fetch Response) is discarded, and so are the representation
   *   headers that described it;
   * - it is made uncacheable: `Cache-Control` / `Expires` set before the failure are dropped and
   *   `Cache-Control: no-store` is sent (RFC 9111), so a cache never keeps a failure — a
   *   deliberately cacheable failure is one the handler builds itself (`setStatus(404)` + body);
   * - the body goes through the app's `transformErrorBody` (used only when it returns a plain
   *   object with a numeric `statusCode` and a string `message`; the status stays the error's);
   * - if the hook or the renderer throws, the error is logged and a plain JSON body is used
   *   (the original body when the transformed one cannot be serialized).
   */
  protected prepareError(error: HttpError, ctx: EventContext | undefined): void {
    this.normalizeHeaderKeys()
    this.applyError(error, ctx)
  }

  /** {@link prepareError} for header keys already folded to lower case; leaves them folded. */
  private applyError(error: HttpError, ctx: EventContext | undefined): void {
    discardBody(this._body)
    this._body = undefined
    const original: TWooksErrorBodyExt = error.body
    // a 416 names the current length (`Content-Range: bytes */<size>`, RFC 9110 §15.5.17)
    this.stripRepresentationHeaders(
      original.statusCode === EHttpStatusCode.RangeNotSatisfiable ? 'content-range' : undefined,
    )
    delete this._headers.expires
    this._headers['cache-control'] = 'no-store'

    if (!ctx) {
      this.renderPlainError(original)
      return
    }
    let data = original
    const transform = getHttpAppConfig(ctx).transformErrorBody
    if (transform) {
      try {
        const out: unknown = transform(original, error, ctx)
        if (isErrorBody(out)) {
          data = { ...out, statusCode: original.statusCode, error: out.error ?? original.error }
        } else {
          if (out && typeof (out as Promise<unknown>).then === 'function') {
            ignoreRejection(out as Promise<unknown>)
          }
          this._logger.error(
            'transformErrorBody must return { statusCode: number, message: string, ... } synchronously — sending the original error body',
          )
        }
      } catch (transformError) {
        this._logger.error(
          'transformErrorBody failed, sending the original error body',
          transformError,
        )
      }
    }
    try {
      this.renderError(data, ctx)
    } catch (renderError) {
      this._logger.error('Error rendering failed, sending a plain JSON error body', renderError)
      try {
        this.renderPlainError(data)
      } catch {
        // the transformed body does not serialize — the original does
        this.renderPlainError(original)
      }
    }
    if (!lowerCaseRenderErrors.has(this.renderError)) {
      // a subclass's renderer may write any casing
      this.normalizeHeaderKeys()
    }
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
    const keysNormalized = this._keysNormalized
    this._keysNormalized = false

    // Capture mode: finalize state but don't write to socket
    if (this._captureMode) {
      this.finalizeCookies()
      return
    }
    this.prepareForWrite(keysNormalized)

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

  /**
   * Readies the buffered state for writing: cookies rendered into `Set-Cookie`, one key per
   * header name, and a GET/HEAD whose If-Match / If-Unmodified-Since fails turned into a 412
   * (through the error path). `keysNormalized`: the header keys were folded just before.
   */
  private prepareForWrite(keysNormalized = false): void {
    this.finalizeCookies()
    if (!keysNormalized) {
      this.normalizeHeaderKeys()
    }
    this._mayBeConditional = mayHaveConditional(this._req)
    if (this._mayBeConditional && this.failsPreconditions()) {
      this.applyError(new HttpError(EHttpStatusCode.PreconditionFailed), tryGetCurrent())
    }
  }

  private finalizeCookies(): void {
    if (!this._hasCookies) {
      return
    }
    const rendered = this.getSetCookieStrings()
    if (rendered.length > 0) {
      this._headers['set-cookie'] = appendSetCookie(
        this._headers['set-cookie'] || undefined,
        rendered,
      )
    }
    this._hasCookies = false
  }

  /**
   * Whether a GET/HEAD answer that would be 2xx fails the request's If-Match /
   * If-Unmodified-Since (RFC 9110 §13.2.1) against its own validators: the `ETag` /
   * `Last-Modified` headers, or the ones a prerendered body or a returned fetch Response carries.
   * The status judged is the one the response will have: the handler's, else a returned fetch
   * Response's, else a 2xx default.
   */
  private failsPreconditions(): boolean {
    const method = this._req.method
    if (method !== 'GET' && method !== 'HEAD') {
      return false
    }
    const h = this._req.headers
    if (h['if-match'] === undefined && h['if-unmodified-since'] === undefined) {
      return false
    }
    const body = this._body
    const fetchResponse = hasFetchResponse && body instanceof globalThis.Response ? body : undefined
    const status = this._status || (fetchResponse ? fetchResponse.status : EHttpStatusCode.OK)
    if (status < 200 || status > 299) {
      return false
    }
    let etag: string | string[] | undefined = this._headers.etag
    let lastModified: string | string[] | undefined = this._headers['last-modified']
    if (fetchResponse) {
      etag ??= fetchResponse.headers.get('etag') ?? undefined
      lastModified ??= fetchResponse.headers.get('last-modified') ?? undefined
    } else if (
      etag === undefined &&
      typeof body === 'object' &&
      body !== null &&
      !(body instanceof Readable)
    ) {
      etag = getPrerenderedJson(body)?.etag
    }
    return (
      checkPreconditions(method, h, toValidators(etag, lastModified)) ===
      EHttpStatusCode.PreconditionFailed
    )
  }

  /**
   * Conditional GET (RFC 9110 §13.2.2, §15.4.5) for a GET/HEAD response:
   * - `prerenderedEtag` (from `prerenderJson`) becomes the `ETag` header of a 2xx answer unless
   *   one was set explicitly (other methods get no ETag: a validator on e.g. a PUT response
   *   would describe the stored resource);
   * - a 200 whose `If-None-Match` / `If-Modified-Since` says the client's copy is current
   *   becomes a `304` (If-Match / If-Unmodified-Since were already checked by `send()`);
   * - a status the handler set to `304` itself is sent the same way.
   * A 304 drops the body and the representation headers and keeps every other header.
   * Returns `true` when the response became a `304`.
   */
  protected applyConditional(prerenderedEtag?: string): boolean {
    if (this._status === EHttpStatusCode.NotModified) {
      // a 304 the handler chose itself — sent like an automatic one
      this.stripRepresentationHeaders()
      return true
    }
    const method = this._req.method
    if ((method !== 'GET' && method !== 'HEAD') || this._status < 200 || this._status > 299) {
      return false
    }
    if (prerenderedEtag !== undefined && this._headers.etag === undefined) {
      this._headers.etag = prerenderedEtag
    }
    if (this._status !== EHttpStatusCode.OK || !this._mayBeConditional) {
      return false
    }
    const reqHeaders = this._req.headers
    if (
      reqHeaders['if-none-match'] === undefined &&
      reqHeaders['if-modified-since'] === undefined
    ) {
      return false
    }
    const verdict = checkPreconditions(
      method,
      reqHeaders,
      // this 200 IS a current representation (`If-None-Match: *` matches it)
      toValidators(this._headers.etag, this._headers['last-modified']),
    )
    if (verdict !== EHttpStatusCode.NotModified) {
      return false
    }
    this._status = EHttpStatusCode.NotModified
    this.stripRepresentationHeaders()
    return true
  }

  /**
   * RFC 9110 §15.4.5: a 304 carries no representation metadata beyond the validators — the
   * representation headers below are dropped (except `keep`); everything else (Content-Location,
   * Content-Security-Policy, cookies…) stays.
   */
  private stripRepresentationHeaders(keep?: string): void {
    for (const name of REPRESENTATION_HEADERS) {
      if (name !== keep) {
        delete this._headers[name]
      }
    }
  }

  /** RFC 9110 §8.6: no Content-Length on a 1xx or 204 response. */
  private dropBodilessLength(): void {
    if (this._status === EHttpStatusCode.NoContent || this._status < 200) {
      delete this._headers['content-length']
    }
  }

  /**
   * HEAD answers with the headers a GET would send (RFC 9110 §9.3.2). A handler that sets
   * Content-Length itself and returns NO body on HEAD (as a file server does) knows the GET
   * length — it is kept, and the answer counts as having a body for the default status. With a
   * body, HEAD measures it like GET does.
   */
  private keepsHeadLength(method: string | undefined, rendered: string | Uint8Array): boolean {
    return (
      method === 'HEAD' &&
      (typeof rendered === 'string' ? rendered === '' : rendered.byteLength === 0) &&
      this._headers['content-length'] !== undefined
    )
  }

  /**
   * Renders a regular body and settles the default status — shared by `send()` and
   * `toWebResponse()`, which then each set the length their own way. The prerender entry it
   * picked is left for `takePrerendered()`.
   */
  private renderRegular(method: string | undefined): string | Uint8Array {
    const rendered = this.renderBody()
    this.autoStatus(!!rendered || this.keepsHeadLength(method, rendered))
    return rendered
  }

  /** Sets Content-Length (one key: headers are stored by lower-case name). */
  private setContentLength(length: number): void {
    this._headers['content-length'] = length.toString()
  }

  /**
   * Folds any header key not in lower case (written directly by a subclass, say) into its
   * lower-case key, so each header name goes out exactly once: `set-cookie` values are joined,
   * any other header keeps the last value written. Called before the headers are written.
   */
  protected normalizeHeaderKeys(): void {
    for (const key in this._headers) {
      const lower = key.toLowerCase()
      if (lower === key) {
        continue
      }
      const value = this._headers[key]
      delete this._headers[key]
      this._headers[lower] =
        lower === 'set-cookie' ? appendSetCookie(this._headers[lower], value) : value
    }
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
    this._status = getDefaultHttpStatus(this._req.method, hasBody)
  }

  private sendStream(source: Readable, method: string | undefined): Promise<void> {
    this.autoStatus(true)
    const notModified = this.applyConditional()
    this._res.writeHead(this._status, this._headers)
    if (method === 'HEAD' || notModified) {
      discardBody(source)
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
    const notModified = this.applyConditional()

    this._res.writeHead(this._status, this._headers)

    if (method === 'HEAD' || notModified || !fetchResponse.body) {
      discardBody(fetchResponse)
      this._res.end()
      return
    }
    return this.pipeToResponse(
      Readable.fromWeb(fetchResponse.body as unknown as NodeReadableStream<Uint8Array>),
      'Error streaming fetch response body',
    )
  }

  private sendRegular(method: string | undefined): void | Promise<void> {
    const body = this.renderRegular(method)
    const prerendered = this.takePrerendered()
    const headLength = this.keepsHeadLength(method, body)
    const size = renderedSize(body, prerendered)
    // Eligibility does not depend on the client: every eligible response varies on Accept-Encoding
    const compression =
      this._compression && this.isCompressible(size, this._compression)
        ? this._compression
        : undefined
    let encoding: THttpCompressionEncoding | undefined
    if (compression) {
      this.addVary('Accept-Encoding')
      encoding = negotiateEncoding(this._req.headers['accept-encoding'], compression.encodings)
    }
    if (this.applyConditional(prerendered?.etag)) {
      if (encoding) {
        // a 304 carries the validators the 200 it confirms would carry (RFC 9110 §15.4.5)
        this.weakenEtag()
      }
      this._res.writeHead(this._status, this._headers).end()
      return
    }
    if (encoding && compression) {
      if (method === 'HEAD') {
        // the headers GET would send — its compressed length is unknown without compressing,
        // so none is sent (never the identity length next to an encoding)
        this.markEncoded(encoding)
        delete this._headers['content-length']
        this._res.writeHead(this._status, this._headers).end()
        return
      }
      return this.sendCompressed(body, size, encoding, compression, prerendered)
    }
    if (!headLength) {
      this.setContentLength(size)
    }
    this.dropBodilessLength()

    this._res.writeHead(this._status, this._headers).end(method === 'HEAD' ? '' : body)
  }

  /**
   * Whether a rendered regular body of `size` bytes may be compressed — independent of the
   * request's `Accept-Encoding` and of the method (HEAD negotiates like GET).
   */
  private isCompressible(size: number, opts: TResolvedHttpCompression): boolean {
    const status = this._status
    if (
      !size ||
      size < opts.threshold ||
      status < 200 ||
      status === 204 ||
      status === 206 ||
      status === 304 ||
      this._headers['content-encoding'] !== undefined
    ) {
      return false
    }
    const cacheControl = this._headers['cache-control']
    if (cacheControl !== undefined && /no-transform/i.test(String(cacheControl))) {
      return false
    }
    const contentType = this._headers['content-type']
    return typeof contentType === 'string' && opts.filter(contentType, this)
  }

  /**
   * Adds request headers the response depends on to `Vary` (chainable). Merges case-insensitively
   * with what is there, never duplicates, and leaves `Vary: *` alone.
   * @example response.vary('Accept-Language', 'Cookie')
   */
  vary(...headers: string[]): this {
    for (const token of headers) {
      this.addVary(token)
    }
    return this
  }

  /** {@link vary} for one header name. */
  private addVary(token: string): void {
    const merged = mergeVary(this._headers.vary, token)
    if (merged !== undefined) {
      this._headers.vary = merged
    }
  }

  /**
   * Content-Encoding for a compressed body — and a strong `ETag` weakened: a strong validator
   * promises byte-identical bodies, and the encoded body is not.
   */
  private markEncoded(encoding: THttpCompressionEncoding): void {
    this._headers['content-encoding'] = encoding
    this.weakenEtag()
  }

  /** A strong `ETag` becomes weak (`W/"…"`). */
  private weakenEtag(): void {
    const etag = this._headers.etag
    if (typeof etag === 'string' && etag && !etag.startsWith('W/')) {
      this._headers.etag = `W/${etag}`
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
      this.markEncoded(encoding)
    }
    this.setContentLength(length)
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

/** An async hook's result is rejected anyway — keep its rejection from going unhandled. */
function ignoreRejection(promise: Promise<unknown>): void {
  promise.catch(() => undefined)
}

/**
 * Releases a body that will not be sent: a stream is destroyed (its file descriptor or socket
 * freed), an unread fetch `Response` body is cancelled. Anything else is left alone.
 */
function discardBody(body: unknown): void {
  if (body instanceof Readable) {
    body.destroy()
  } else if (
    hasFetchResponse &&
    body instanceof globalThis.Response &&
    !body.bodyUsed &&
    body.body
  ) {
    ignoreRejection(body.body.cancel())
  }
}

/** `Set-Cookie` values `added` after the `existing` ones (`undefined` = none yet). */
function appendSetCookie(
  existing: string | string[] | undefined,
  added: string | string[],
): string | string[] {
  if (existing === undefined) {
    return added
  }
  return [
    ...(Array.isArray(existing) ? existing : [existing]),
    ...(Array.isArray(added) ? added : [added]),
  ]
}

/** Whether a `transformErrorBody` result can be rendered as an error body. */
function isErrorBody(v: unknown): v is TWooksErrorBodyExt {
  return (
    typeof v === 'object' &&
    v !== null &&
    !Array.isArray(v) &&
    typeof (v as { then?: unknown }).then !== 'function' &&
    typeof (v as TWooksErrorBodyExt).statusCode === 'number' &&
    typeof (v as TWooksErrorBodyExt).message === 'string'
  )
}

lowerCaseRenderErrors.add(HttpResponse.prototype['renderError'])
