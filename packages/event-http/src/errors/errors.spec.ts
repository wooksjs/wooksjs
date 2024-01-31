import { IncomingMessage, ServerResponse } from 'http'
import { Socket } from 'net'

import { createHttpContext } from '../event-http'
import type { BaseHttpResponse } from '../response'
import { createWooksResponder } from '../response'
import { HttpErrorRenderer } from './error-renderer'
import type { TWooksErrorBodyExt } from './http-error'
import { HttpError } from './http-error'

const renderer = new HttpErrorRenderer()
describe('response', () => {
  const req = new IncomingMessage(new Socket({}))
  const res = new ServerResponse(req)
  Object.defineProperty(res, 'writable', { value: true })
  Object.defineProperty(res, 'writableEnded', { value: false })

  beforeEach(() => {
    createHttpContext({ req, res }, {})
  })

  it('must create error-response in json', () => {
    req.headers.accept = 'application/json'
    expect(
      renderer.render(
        createWooksResponder().createResponse(
          new HttpError(405, 'test message')
        ) as BaseHttpResponse<TWooksErrorBodyExt>
      )
    ).toEqual('{"statusCode":405,"error":"Method Not Allowed","message":"test message"}')
  })

  it('must create error-response in json with additional fields', () => {
    req.headers.accept = 'application/json'
    interface MyError {
      statusCode: number
      message: string
      error: string
      additional: string
    }
    expect(
      renderer.render(
        createWooksResponder().createResponse(
          new HttpError<MyError>(405, {
            statusCode: 405,
            message: 'message text',
            error: 'error text',
            additional: 'additional text',
          })
        ) as BaseHttpResponse<TWooksErrorBodyExt>
      )
    ).toEqual(
      '{"statusCode":405,"error":"Method Not Allowed","message":"message text","additional":"additional text"}'
    )
  })

  it('must create error-response in text', () => {
    req.headers.accept = 'text/plain'
    expect(
      renderer.render(
        createWooksResponder().createResponse(
          new HttpError(405, 'test message')
        ) as BaseHttpResponse<TWooksErrorBodyExt>
      )
    ).toContain('405 Method Not Allowed\ntest message')
  })

  it('must create error-response in html', () => {
    req.headers.accept = 'text/html'
    expect(
      renderer.render(
        createWooksResponder().createResponse(
          new HttpError(405, 'test message')
        ) as BaseHttpResponse<TWooksErrorBodyExt>
      )
    ).toEqual(
      '<html style="background-color: #333; color: #bbb;"><head><title>405 Method Not Allowed</title>' +
        '</head><body><center><h1>405 Method Not Allowed</h1></center><center><h4>test message</h1></center>' +
        '<hr color="#666"><center style="color: #666;"> Wooks vJEST_TEST </center></body></html>'
    )
  })

  it('must create error-response in html with additional fields', () => {
    req.headers.accept = 'text/html'
    interface MyError {
      statusCode: number
      message: string
      error: string
      additional: string
    }
    const result = renderer.render(
      createWooksResponder().createResponse(
        new HttpError<MyError>(405, {
          statusCode: 405,
          message: 'message text',
          error: 'error text',
          additional: 'additional text',
        })
      ) as BaseHttpResponse<TWooksErrorBodyExt>
    )
    expect(result).toContain('"additional": "additional text"')
    expect(result).toContain('<pre')
    expect(result).toContain('font-family: monospace;')
    expect(result).toContain('</pre>')
  })
})
