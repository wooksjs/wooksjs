/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable sonarjs/no-duplicate-string */
import type { TConsoleBase } from '@prostojs/logger'
import { useEventLogger } from '@wooksjs/event-core'
import type { ServerResponse } from 'http'
import { Readable } from 'stream'

import { useRequest, useResponse, useSetCookies, useSetHeaders } from '../composables'
import type { TCookieAttributes } from '../types'
import type { TCacheControl } from '../utils/cache-control'
import { renderCacheControl } from '../utils/cache-control'
import { renderCookie } from '../utils/set-cookie'
import { EHttpStatusCode } from '../utils/status-codes'
import { BaseHttpResponseRenderer } from './renderer'

const defaultStatus: Record<string, EHttpStatusCode | undefined> = {
  GET: EHttpStatusCode.OK,
  POST: EHttpStatusCode.Created,
  PUT: EHttpStatusCode.Created,
  PATCH: EHttpStatusCode.Accepted,
  DELETE: EHttpStatusCode.Accepted,
}

const baseRenderer = new BaseHttpResponseRenderer()

export class BaseHttpResponse<BodyType = unknown> {
  constructor(protected renderer: BaseHttpResponseRenderer = baseRenderer) {}

  protected _status: EHttpStatusCode = 0 as EHttpStatusCode

  protected _body?: BodyType

  protected _headers: Record<string, string | string[]> = {}

  get status() {
    return this._status
  }

  set status(value: EHttpStatusCode) {
    this._status = value
  }

  get body() {
    return this._body
  }

  set body(value: BodyType | undefined) {
    this._body = value
  }

  setStatus(value: EHttpStatusCode) {
    this.status = value
    return this
  }

  setBody(value: BodyType) {
    this.body = value
    return this
  }

  getContentType() {
    return this._headers['content-type']
  }

  setContentType(value: string) {
    this._headers['content-type'] = value
    return this
  }

  enableCors(origin = '*') {
    this._headers['Access-Control-Allow-Origin'] = origin
    return this
  }

  setCookie(name: string, value: string, attrs?: Partial<TCookieAttributes>) {
    const cookies = (this._headers['set-cookie'] = (this._headers['set-cookie'] || []) as string[])
    cookies.push(renderCookie(name, { value, attrs: attrs || {} }))
    return this
  }

  setCacheControl(data: TCacheControl) {
    this.setHeader('cache-control', renderCacheControl(data))
  }

  setCookieRaw(rawValue: string) {
    const cookies = (this._headers['set-cookie'] = (this._headers['set-cookie'] || []) as string[])
    cookies.push(rawValue)
    return this
  }

  header(name: string, value: string) {
    this._headers[name] = value
    return this
  }

  setHeader(name: string, value: string) {
    return this.header(name, value)
  }

  getHeader(name: string) {
    return this._headers[name]
  }

  protected mergeHeaders() {
    const { headers } = useSetHeaders()

    const { cookies, removeCookie } = useSetCookies()
    const newCookies = this._headers['set-cookie'] || []
    for (const cookie of newCookies) {
      removeCookie(cookie.slice(0, cookie.indexOf('=')))
    }
    this._headers = {
      ...headers(),
      ...this._headers,
    }
    const setCookie = [...newCookies, ...cookies()]
    if (setCookie.length > 0) {
      this._headers['set-cookie'] = setCookie
    }
    return this
  }

  protected mergeStatus(renderedBody: string | Uint8Array) {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    this.status = this.status || useResponse().status()
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!this.status) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const { method } = useRequest()
      this.status = renderedBody
        ? defaultStatus[method as 'GET'] || EHttpStatusCode.OK
        : EHttpStatusCode.NoContent
    }
    return this
  }

  protected mergeFetchStatus(fetchStatus: number) {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    this.status = this.status || useResponse().status() || fetchStatus
  }

  protected panic(text: string, logger: TConsoleBase) {
    const error = new Error(text)
    logger.error(error)
    throw error
  }

  async respond() {
    const { rawResponse, hasResponded } = useResponse()
    const { method, rawRequest } = useRequest()
    const logger = useEventLogger('http-response')
    if (hasResponded()) {
      this.panic('The response was already sent.', logger)
    }
    this.mergeHeaders()
    const res = rawResponse()
    if (this.body instanceof Readable) {
      // responding with readable stream
      const stream = this.body
      this.mergeStatus('ok')
      res.writeHead(this.status, {
        ...this._headers,
      })
      rawRequest.once('close', () => {
        stream.destroy()
      })
      if (method === 'HEAD') {
        stream.destroy()
        res.end()
      } else {
        return new Promise((resolve, reject) => {
          stream.on('error', e => {
            stream.destroy()
            res.end()
            reject(e)
          })
          stream.on('close', () => {
            stream.destroy()
            resolve(undefined)
          })
          stream.pipe(res)
        })
      }
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    } else if (globalThis.Response && this.body instanceof Response /* Fetch Response */) {
      this.mergeFetchStatus(this.body.status)
      if (method === 'HEAD') {
        res.end()
      } else {
        const additionalHeaders: Record<string, string | string[]> = {}
        if (this.body.headers.get('content-length')) {
          additionalHeaders['content-length'] = this.body.headers.get('content-length')!
        }
        if (this.body.headers.get('content-type')) {
          additionalHeaders['content-type'] = this.body.headers.get('content-type')!
        }
        res.writeHead(this.status, {
          ...additionalHeaders,
          ...this._headers,
        })
        await respondWithFetch(this.body.body, res)
      }
    } else {
      const renderedBody = this.renderer.render(this)
      this.mergeStatus(renderedBody)
      res
        .writeHead(this.status, {
          'content-length': Buffer.byteLength(renderedBody),
          ...this._headers,
        })
        .end(method === 'HEAD' ? '' : renderedBody)
    }
  }
}

async function respondWithFetch(fetchBody: ReadableStream<Uint8Array> | null, res: ServerResponse) {
  if (fetchBody) {
    try {
      for await (const chunk of fetchBody as unknown as AsyncIterable<Uint8Array>) {
        res.write(chunk)
      }
    } catch (error) {
      // ?
    }
  }
  res.end()
}
