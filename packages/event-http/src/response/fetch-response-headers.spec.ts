import { IncomingMessage, ServerResponse } from 'http'
import type { AddressInfo } from 'net'
import { Socket } from 'net'
import { describe, expect, it, vi } from 'vitest'
import { Wooks } from 'wooks'

import { createHttpApp } from '../http-adapter'
import { HttpResponse } from './http-response'

const logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
}

function createSocketResponse(method = 'GET') {
  const req = new IncomingMessage(new Socket({}))
  req.method = method
  req.url = '/'
  const res = new ServerResponse(req)
  const writeHead = vi.spyOn(res, 'writeHead').mockReturnValue(res)
  vi.spyOn(res, 'write').mockReturnValue(true)
  vi.spyOn(res, 'end').mockReturnValue(res)
  return { req, res, writeHead, response: new HttpResponse(res, req, logger as any) }
}

describe('fetch Response header forwarding (socket path — sendFetchResponse)', () => {
  it('forwards all headers from the returned fetch Response', async () => {
    const { response, writeHead } = createSocketResponse()
    response.body = new Response('hi', {
      headers: {
        'content-type': 'application/xml',
        'cache-control': 'public, max-age=3600',
        'x-test': '1',
      },
    })
    await response.send()

    const headers = writeHead.mock.calls[0][1] as Record<string, string | string[]>
    expect(headers['content-type']).toBe('application/xml')
    expect(headers['cache-control']).toBe('public, max-age=3600')
    expect(headers['x-test']).toBe('1')
  })

  it('buffered handler headers win over fetch Response headers', async () => {
    const { response, writeHead } = createSocketResponse()
    response.setHeader('content-type', 'text/handler')
    response.setHeader('cache-control', 'no-store')
    response.body = new Response('hi', {
      headers: {
        'content-type': 'application/xml',
        'cache-control': 'public, max-age=3600',
        'x-fetch': 'yes',
      },
    })
    await response.send()

    const headers = writeHead.mock.calls[0][1] as Record<string, string | string[]>
    expect(headers['content-type']).toBe('text/handler')
    expect(headers['cache-control']).toBe('no-store')
    expect(headers['x-fetch']).toBe('yes')
  })

  it('uses fetch Response content-length when handler did not set one', async () => {
    const { response, writeHead } = createSocketResponse()
    response.body = new Response('hi', {
      headers: { 'content-length': '2' },
    })
    await response.send()

    const headers = writeHead.mock.calls[0][1] as Record<string, string | string[]>
    expect(headers['content-length']).toBe('2')
  })

  it('preserves multiple set-cookie headers as an array', async () => {
    const { response, writeHead } = createSocketResponse()
    response.body = new Response('hi', {
      headers: [
        ['set-cookie', 'a=1; Path=/'],
        ['set-cookie', 'b=2; Path=/'],
      ],
    })
    await response.send()

    const headers = writeHead.mock.calls[0][1] as Record<string, string | string[]>
    expect(headers['set-cookie']).toEqual(['a=1; Path=/', 'b=2; Path=/'])
  })

  it('appends fetch Response cookies after handler cookies', async () => {
    const { response, writeHead } = createSocketResponse()
    response.setCookie('session', 'abc')
    response.body = new Response('hi', {
      headers: [['set-cookie', 'extra=1']],
    })
    await response.send()

    const headers = writeHead.mock.calls[0][1] as Record<string, string | string[]>
    const cookies = headers['set-cookie'] as string[]
    expect(cookies).toHaveLength(2)
    expect(cookies[0]).toContain('session=abc')
    expect(cookies[1]).toBe('extra=1')
  })
})

describe('fetch Response header forwarding (web path — toWebResponse)', () => {
  function createCaptureResponse(method = 'GET') {
    const req = new IncomingMessage(new Socket({}))
    req.method = method
    req.url = '/'
    const res = new ServerResponse(req)
    return { response: new HttpResponse(res, req, logger as any, undefined, true) }
  }

  it('forwards all headers, buffered handler headers win', () => {
    const { response } = createCaptureResponse()
    response.setHeader('cache-control', 'no-store')
    response.body = new Response('hi', {
      headers: {
        'cache-control': 'public, max-age=3600',
        'x-test': '1',
      },
    })
    response.send()

    const webRes = response.toWebResponse()
    expect(webRes.headers.get('cache-control')).toBe('no-store')
    expect(webRes.headers.get('x-test')).toBe('1')
  })

  it('preserves multiple set-cookie headers', () => {
    const { response } = createCaptureResponse()
    response.setCookie('session', 'abc')
    response.body = new Response('hi', {
      headers: [
        ['set-cookie', 'a=1'],
        ['set-cookie', 'b=2'],
      ],
    })
    response.send()

    const cookies = response.toWebResponse().headers.getSetCookie()
    expect(cookies).toHaveLength(3)
    expect(cookies[0]).toContain('session=abc')
    expect(cookies[1]).toBe('a=1')
    expect(cookies[2]).toBe('b=2')
  })
})

describe('fetch Response headers end-to-end (real socket vs app.fetch)', () => {
  it('emits identical headers on both render paths', async () => {
    const app = createHttpApp({}, new Wooks())
    app.get(
      '/x',
      () =>
        new Response('hi', {
          headers: { 'cache-control': 'public, max-age=60', 'x-test': '1' },
        }),
    )

    await app.listen(0)
    try {
      const port = (app.getServer()!.address() as AddressInfo).port
      const socketRes = await fetch(`http://localhost:${port}/x`)
      expect(socketRes.status).toBe(200)
      expect(socketRes.headers.get('cache-control')).toBe('public, max-age=60')
      expect(socketRes.headers.get('x-test')).toBe('1')
      expect(await socketRes.text()).toBe('hi')

      const webRes = (await app.fetch(new Request(`http://localhost:${port}/x`)))!
      expect(webRes.headers.get('cache-control')).toBe('public, max-age=60')
      expect(webRes.headers.get('x-test')).toBe('1')
    } finally {
      await app.close()
    }
  })
})
