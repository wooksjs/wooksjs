import { current } from '@wooksjs/event-core'
import { IncomingMessage, ServerResponse } from 'http'
import { Socket } from 'net'
import { beforeEach, describe, expect, it } from 'vitest'

import { useRequest } from '../composables'
import { prepareTestHttpContext } from '../testing'
import { WooksHttpResponse } from '../response/wooks-http-response'
import type { TWooksErrorBodyExt } from './http-error'
import { HttpError } from './http-error'

describe('WooksHttpResponse error rendering', () => {
  let runInContext: ReturnType<typeof prepareTestHttpContext>

  beforeEach(() => {
    runInContext = prepareTestHttpContext({ url: '' })
  })

  function createWooksResponse(): WooksHttpResponse {
    const req = new IncomingMessage(new Socket({}))
    const res = new ServerResponse(req)
    return new WooksHttpResponse(res, req, console as any)
  }

  it('must create error-response in json', () => {
    runInContext(() => {
      useRequest().headers.accept = 'application/json'
      const ctx = current()
      const response = createWooksResponse()
      const error = new HttpError(405, 'test message')
      ;(response as any).renderError(error.body, ctx)
      expect(response.body).toEqual('{"statusCode":405,"message":"test message","error":"Method Not Allowed"}')
    })
  })

  it('must create error-response in json with additional fields', () => {
    runInContext(() => {
      useRequest().headers.accept = 'application/json'
      const ctx = current()
      const response = createWooksResponse()
      interface MyError {
        statusCode: number
        message: string
        error: string
        additional: string
      }
      const error = new HttpError<MyError>(405, {
        statusCode: 405,
        message: 'message text',
        error: 'error text',
        additional: 'additional text',
      })
      ;(response as any).renderError(error.body, ctx)
      expect(response.body).toEqual(
        '{"statusCode":405,"message":"message text","error":"Method Not Allowed","additional":"additional text"}',
      )
    })
  })

  it('must create error-response in text', () => {
    runInContext(() => {
      useRequest().headers.accept = 'text/plain'
      const ctx = current()
      const response = createWooksResponse()
      const error = new HttpError(405, 'test message')
      ;(response as any).renderError(error.body, ctx)
      expect(response.body).toContain('405 Method Not Allowed\ntest message')
    })
  })

  it('must create error-response in html', () => {
    runInContext(() => {
      useRequest().headers.accept = 'text/html'
      const ctx = current()
      const response = createWooksResponse()
      const error = new HttpError(405, 'test message')
      ;(response as any).renderError(error.body, ctx)
      expect(response.body).toEqual(expect.stringContaining('<title>405 Method Not Allowed</title>'))
    })
  })

  it('must create error-response in html with additional fields', () => {
    runInContext(() => {
      useRequest().headers.accept = 'text/html'
      const ctx = current()
      const response = createWooksResponse()
      interface MyError {
        statusCode: number
        message: string
        error: string
        additional: string
      }
      const error = new HttpError<MyError>(405, {
        statusCode: 405,
        message: 'message text',
        error: 'error text',
        additional: 'additional text',
      })
      ;(response as any).renderError(error.body, ctx)
      expect(response.body).toContain('"additional": "additional text"')
    })
  })
})
