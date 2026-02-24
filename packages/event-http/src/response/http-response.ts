import type { EventContext, Logger } from '@wooksjs/event-core'
import type { IncomingMessage, ServerResponse } from 'http'
import { Readable } from 'stream'

import type { HttpError, TWooksErrorBodyExt } from '../errors/http-error'
import type { TCookieAttributes, TSetCookieData } from '../types'
import type { TCacheControl } from '../utils/cache-control'
import { renderCacheControl } from '../utils/cache-control'
import { renderCookie } from '../utils/set-cookie'
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

export class HttpResponse {
  constructor(
    protected readonly _res: ServerResponse,
    protected readonly _req: IncomingMessage,
    protected readonly _logger: Logger,
  ) {}

  protected _status: EHttpStatusCode = 0 as EHttpStatusCode
  protected _body: unknown = undefined
  protected _headers: Record<string, string | string[]> = {}
  protected _cookies: Record<string, TSetCookieData> = {}
  protected _rawCookies: string[] = []
  protected _hasCookies = false
  protected _responded = false

  // --- Status ---

  get status(): EHttpStatusCode {
    return this._status
  }

  set status(value: EHttpStatusCode) {
    this._status = value
  }

  setStatus(value: EHttpStatusCode): this {
    this._status = value
    return this
  }

  // --- Body ---

  get body(): unknown {
    return this._body
  }

  set body(value: unknown) {
    this._body = value
  }

  setBody(value: unknown): this {
    this._body = value
    return this
  }

  // --- Headers ---

  setHeader(name: string, value: string | number | string[]): this {
    this._headers[name] = Array.isArray(value) ? value : value.toString()
    return this
  }

  getHeader(name: string): string | string[] | undefined {
    return this._headers[name]
  }

  removeHeader(name: string): this {
    delete this._headers[name]
    return this
  }

  headers(): Readonly<Record<string, string | string[]>> {
    return this._headers
  }

  setContentType(value: string): this {
    this._headers['content-type'] = value
    return this
  }

  getContentType(): string | string[] | undefined {
    return this._headers['content-type']
  }

  enableCors(origin = '*'): this {
    this._headers['access-control-allow-origin'] = origin
    return this
  }

  // --- Cookies (outgoing set-cookie) ---

  setCookie(name: string, value: string, attrs?: Partial<TCookieAttributes>): this {
    this._cookies[name] = { value, attrs: attrs || {} }
    this._hasCookies = true
    return this
  }

  getCookie(name: string): TSetCookieData | undefined {
    return this._cookies[name]
  }

  removeCookie(name: string): this {
    delete this._cookies[name]
    return this
  }

  clearCookies(): this {
    this._cookies = {}
    this._rawCookies = []
    this._hasCookies = false
    return this
  }

  setCookieRaw(rawValue: string): this {
    this._rawCookies.push(rawValue)
    this._hasCookies = true
    return this
  }

  // --- Cache control ---

  setCacheControl(data: TCacheControl): this {
    this._headers['cache-control'] = renderCacheControl(data)
    return this
  }

  setAge(value: number | TTimeMultiString): this {
    this._headers.age = convertTime(value, 's').toString()
    return this
  }

  setExpires(value: Date | string | number): this {
    this._headers.expires =
      typeof value === 'string' || typeof value === 'number'
        ? new Date(value).toUTCString()
        : value.toUTCString()
    return this
  }

  setPragmaNoCache(value = true): this {
    this._headers.pragma = value ? 'no-cache' : ''
    return this
  }

  // --- Raw access & state ---

  getRawRes(passthrough?: boolean): ServerResponse {
    if (!passthrough) {
      this._responded = true
    }
    return this._res
  }

  get responded(): boolean {
    return this._responded || !this._res.writable || this._res.writableEnded
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

  sendError(error: HttpError, ctx: EventContext): void | Promise<void> {
    const data = error.body
    this.renderError(data, ctx)
    return this.send()
  }

  send(): void | Promise<void> {
    if (this._responded) {
      const err = new Error('The response was already sent.')
      this._logger.error(err.message, err)
      throw err
    }
    this._responded = true

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

    // Branch C: Regular body (synchronous — no Promise allocated)
    this.sendRegular(method)
  }

  private finalizeCookies(): void {
    if (!this._hasCookies) { return }
    const entries = Object.entries(this._cookies)
    const rendered: string[] = []
    for (const [name, data] of entries) {
      if (data) {
        rendered.push(renderCookie(name, data))
      }
    }
    if (this._rawCookies.length > 0) {
      rendered.push(...this._rawCookies)
    }
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
  }

  private autoStatus(hasBody: boolean): void {
    if (this._status) {
      return
    }
    if (!hasBody) {
      this._status = EHttpStatusCode.NoContent
      return
    }
    this._status =
      defaultStatus[this._req.method as 'GET'] || EHttpStatusCode.OK
  }

  private sendStream(stream: Readable, method: string | undefined): Promise<void> {
    this.autoStatus(true)
    this._res.writeHead(this._status, this._headers)
    this._req.once('close', () => {
      stream.destroy()
    })
    if (method === 'HEAD') {
      stream.destroy()
      this._res.end()
      return Promise.resolve()
    }
    return new Promise((resolve, reject) => {
      stream.on('error', (e) => {
        this._logger.error('Stream error', e)
        stream.destroy()
        this._res.end()
        reject(e)
      })
      stream.on('close', () => {
        stream.destroy()
        resolve()
      })
      stream.pipe(this._res)
    })
  }

  private async sendFetchResponse(
    fetchResponse: Response,
    method: string | undefined,
  ): Promise<void> {
    // Use fetch status as fallback
    this._status = this._status || (fetchResponse.status as EHttpStatusCode)

    const fetchContentLength = fetchResponse.headers.get('content-length')
    if (fetchContentLength) {
      this._headers['content-length'] = fetchContentLength
    }
    const fetchContentType = fetchResponse.headers.get('content-type')
    if (fetchContentType) {
      this._headers['content-type'] = fetchContentType
    }

    this._res.writeHead(this._status, this._headers)

    if (method === 'HEAD') {
      this._res.end()
      return
    }

    const fetchBody = fetchResponse.body
    if (fetchBody) {
      try {
        for await (const chunk of fetchBody as unknown as AsyncIterable<Uint8Array>) {
          this._res.write(chunk)
        }
      } catch (error) {
        this._logger.error('Error streaming fetch response body', error)
      }
    }
    if (!this._res.writableEnded) {
      this._res.end()
    }
  }

  private sendRegular(method: string | undefined): void {
    const renderedBody = this.renderBody()
    this.autoStatus(!!renderedBody)
    const contentLength =
      typeof renderedBody === 'string'
        ? Buffer.byteLength(renderedBody)
        : renderedBody.byteLength
    this._headers['content-length'] = contentLength.toString()

    this._res
      .writeHead(this._status, this._headers)
      .end(method === 'HEAD' ? '' : renderedBody)
  }
}
