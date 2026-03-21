import { describe, it, expect, vi } from 'vitest'
import { IncomingMessage, ServerResponse } from 'http'
import { Socket } from 'net'
import { Wooks } from 'wooks'

import { createHttpApp, type TWooksHttpOptions } from './http-adapter'
import { HttpError } from './errors'
import { HttpResponse } from './response/http-response'
import { useRequest } from './composables/request'
import { useResponse } from './composables/response'
import { useAuthorization } from './composables/header-authorization'
import { useCookies } from './composables/cookies'
import { useRouteParams } from '@wooksjs/event-core'

/** Creates an app with its own isolated router (not the global singleton). */
function createApp(opts?: TWooksHttpOptions) {
  return createHttpApp(opts, new Wooks())
}

const logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
}

// --- Group 1: Capture mode + toWebResponse() ---

describe('HttpResponse capture mode', () => {
  function createCaptureResponse(method = 'GET') {
    const req = new IncomingMessage(new Socket({}))
    req.method = method
    req.url = '/'
    const res = new ServerResponse(req)
    return { req, res, response: new HttpResponse(res, req, logger as any, undefined, true) }
  }

  it('send() in capture mode marks responded without writing to ServerResponse', () => {
    const { res, response } = createCaptureResponse()
    response.body = 'hello'
    response.send()
    expect(response.responded).toBe(true)
    expect(res.writableEnded).toBe(false)
  })

  it('getRawRes() is available in capture mode', () => {
    const { res, response } = createCaptureResponse()
    expect(response.getRawRes(true)).toBe(res)
  })

  it('toWebResponse() with string body', async () => {
    const { response } = createCaptureResponse()
    response.body = 'Hello World!'
    response.send()

    const webRes = response.toWebResponse()
    expect(webRes.status).toBe(200)
    expect(webRes.headers.get('content-type')).toBe('text/plain')
    expect(webRes.headers.get('content-length')).toBe(
      Buffer.byteLength('Hello World!').toString(),
    )
    expect(await webRes.text()).toBe('Hello World!')
  })

  it('toWebResponse() with object body overrides json() to skip parse', async () => {
    const { response } = createCaptureResponse()
    const data = { message: 'ok', count: 42 }
    response.body = data
    response.send()

    const webRes = response.toWebResponse()
    expect(webRes.status).toBe(200)
    expect(webRes.headers.get('content-type')).toBe('application/json')
    const json = await webRes.json()
    expect(json).toEqual(data)
    // Should return the original object reference, not a parsed copy
    expect(json).toBe(data)
  })

  it('toWebResponse() with cookies via setCookie()', async () => {
    const { response } = createCaptureResponse()
    response.setCookie('session', 'abc123')
    response.setCookie('theme', 'dark')
    response.body = 'ok'
    response.send()

    const webRes = response.toWebResponse()
    const setCookies = webRes.headers.getSetCookie()
    expect(setCookies.length).toBe(2)
    expect(setCookies[0]).toContain('session=abc123')
    expect(setCookies[1]).toContain('theme=dark')
  })

  it('toWebResponse() auto-infers status per method', () => {
    const cases: Array<[string, number]> = [
      ['GET', 200],
      ['POST', 201],
      ['PUT', 201],
      ['PATCH', 202],
      ['DELETE', 202],
    ]
    for (const [method, expected] of cases) {
      const { response } = createCaptureResponse(method)
      response.body = 'data'
      response.send()
      expect(response.toWebResponse().status).toBe(expected)
    }
  })

  it('toWebResponse() preserves explicit status', () => {
    const { response } = createCaptureResponse()
    response.setStatus(418 as any)
    response.body = 'teapot'
    response.send()
    expect(response.toWebResponse().status).toBe(418)
  })

  it('toWebResponse() with multi-value headers', () => {
    const { response } = createCaptureResponse()
    response.setHeader('x-multi', ['val1', 'val2'])
    response.body = 'ok'
    response.send()

    const webRes = response.toWebResponse()
    expect(webRes.headers.get('x-multi')).toBe('val1, val2')
  })

  it('toWebResponse() with no body returns 204 NoContent', () => {
    const { response } = createCaptureResponse()
    response.send()
    expect(response.toWebResponse().status).toBe(204)
  })

  it('text() override returns pre-computed string without stream read', async () => {
    const { response } = createCaptureResponse()
    response.body = 'direct string'
    response.send()

    const webRes = response.toWebResponse()
    const t1 = await webRes.text()
    expect(t1).toBe('direct string')
  })

  it('text() on JSON body returns the stringified version', async () => {
    const { response } = createCaptureResponse()
    response.body = { key: 'value' }
    response.send()

    const webRes = response.toWebResponse()
    const text = await webRes.text()
    expect(text).toBe(JSON.stringify({ key: 'value' }))
  })

  it('json() is not overridden for string bodies', async () => {
    const { response } = createCaptureResponse()
    response.body = '{"raw":"string"}'
    response.send()

    const webRes = response.toWebResponse()
    // json() should parse from body (not return the string itself)
    const json = await webRes.json()
    expect(json).toEqual({ raw: 'string' })
    expect(typeof json).toBe('object')
  })

  it('json() returns original object reference through full pipeline', async () => {
    const app = createApp()
    const original = { users: [{ id: 1 }], meta: { total: 1 } }
    app.get('/data', () => original)

    const res = await app.request('/data')
    const json = await res.json()
    expect(json).toBe(original)
  })

  it('text() returns pre-computed string through full pipeline', async () => {
    const app = createApp()
    app.get('/txt', () => 'hello from handler')

    const res = await app.request('/txt')
    expect(await res.text()).toBe('hello from handler')
  })
})

// --- Group 2: fetch() / request() integration ---

describe('WooksHttp.fetch() / request()', () => {
  it('GET returns text response', async () => {
    const app = createApp()
    app.get('/hello', () => 'Hello World!')

    const res = await app.request('/hello')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('Hello World!')
  })

  it('GET returns JSON response', async () => {
    const app = createApp()
    app.get('/json', () => ({ message: 'ok' }))

    const res = await app.request('/json')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/json')
    expect(await res.json()).toEqual({ message: 'ok' })
  })

  it('route params are resolved', async () => {
    const app = createApp()
    app.get('/users/:id', () => {
      const { params } = useRouteParams()
      return { id: params.id }
    })

    const res = await app.request('/users/42')
    expect(await res.json()).toEqual({ id: '42' })
  })

  it('POST body is readable', async () => {
    const app = createApp()
    app.post('/echo', async () => {
      const { rawBody } = useRequest()
      const body = await rawBody()
      return JSON.parse(body.toString())
    })

    const res = await app.request('/echo', {
      method: 'POST',
      body: JSON.stringify({ name: 'Alice' }),
      headers: { 'content-type': 'application/json' },
    })
    expect(await res.json()).toEqual({ name: 'Alice' })
  })

  it('HttpError maps to correct status code', async () => {
    const app = createApp()
    app.get('/forbidden', () => {
      throw new HttpError(403, 'Forbidden')
    })

    const res = await app.request('/forbidden')
    expect(res.status).toBe(403)
  })

  it('response headers and cookies are captured', async () => {
    const app = createApp()
    app.get('/headers', () => {
      const response = useResponse()
      response.setHeader('x-custom', 'value')
      response.setCookie('session', 'abc')
      return 'ok'
    })

    const res = await app.request('/headers')
    expect(res.headers.get('x-custom')).toBe('value')
    const setCookies = res.headers.getSetCookie()
    expect(setCookies.some(c => c.includes('session=abc'))).toBe(true)
  })

  it('returns null for unmatched routes (no onNotFound)', async () => {
    const app = createApp()
    const res = await app.request('/nope')
    expect(res).toBeNull()
  })

  it('onNotFound handler works', async () => {
    const app = createApp({ onNotFound: () => 'custom 404' })
    const res = await app.request('/nope')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('custom 404')
  })

  it('content-length is set for regular bodies', async () => {
    const app = createApp()
    app.get('/len', () => 'test')

    const res = await app.request('/len')
    expect(res.headers.get('content-length')).toBe(
      Buffer.byteLength('test').toString(),
    )
  })

  it('request() normalizes relative paths without leading slash', async () => {
    const app = createApp()
    app.get('/foo', () => 'bar')

    const res = await app.request('foo')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('bar')
  })

  it('request() passes through absolute URLs', async () => {
    const app = createApp()
    app.get('/abs', () => 'absolute')

    const res = await app.request('http://example.com/abs')
    expect(await res.text()).toBe('absolute')
  })

  it('fetch() accepts full Request objects', async () => {
    const app = createApp()
    app.get('/fetch-test', () => 'fetched')

    const res = await app.fetch(new Request('http://localhost/fetch-test'))
    expect(await res.text()).toBe('fetched')
  })

  it('async handlers complete before response', async () => {
    const app = createApp()
    app.get('/async', async () => {
      await new Promise(resolve => setTimeout(resolve, 10))
      return 'async result'
    })

    const res = await app.request('/async')
    expect(await res.text()).toBe('async result')
  })

  it('multiple sequential fetch() calls do not leak state', async () => {
    const app = createApp()
    app.get('/a', () => 'response-a')
    app.get('/b', () => 'response-b')

    const resA = await app.request('/a')
    const resB = await app.request('/b')
    expect(await resA.text()).toBe('response-a')
    expect(await resB.text()).toBe('response-b')
  })

  it('handler using getRawRes() produces valid response from captured writes', async () => {
    const app = createApp()
    app.get('/raw', () => {
      const res = useResponse().getRawRes()
      res.writeHead(200, { 'content-type': 'text/plain', 'x-raw': 'yes' })
      res.end('raw body')
    })

    const res = await app.request('/raw')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/plain')
    expect(res.headers.get('x-raw')).toBe('yes')
    expect(await res.text()).toBe('raw body')
  })

  it('handler using getRawRes() with chunked writes', async () => {
    const app = createApp()
    app.get('/chunked', () => {
      const res = useResponse().getRawRes()
      res.writeHead(200, { 'content-type': 'text/plain' })
      res.write('chunk1')
      res.write('chunk2')
      res.end('chunk3')
    })

    const res = await app.request('/chunked')
    expect(await res.text()).toBe('chunk1chunk2chunk3')
  })

  it('handler using getRawRes() with JSON body', async () => {
    const app = createApp()
    app.get('/raw-json', () => {
      const res = useResponse().getRawRes()
      const data = JSON.stringify({ raw: true })
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(data)
    })

    const res = await app.request('/raw-json')
    expect(await res.json()).toEqual({ raw: true })
  })
})

// --- Group 3: SSR header forwarding ---

describe('SSR header forwarding', () => {
  it('forwards authorization header from calling context', async () => {
    const app = createApp()
    app.get('/page', async () => {
      const res = await app.request('/api/auth')
      return res.json()
    })
    app.get('/api/auth', () => {
      const { authorization } = useAuthorization()
      return { auth: authorization }
    })

    const res = await app.request('/page', {
      headers: { authorization: 'Bearer tok123' },
    })
    expect(await res.json()).toEqual({ auth: 'Bearer tok123' })
  })

  it('forwards cookie header from calling context', async () => {
    const app = createApp()
    app.get('/page', async () => {
      const res = await app.request('/api/cookies')
      return res.json()
    })
    app.get('/api/cookies', () => {
      const { getCookie } = useCookies()
      return { session: getCookie('session') }
    })

    const res = await app.request('/page', {
      headers: { cookie: 'session=xyz789' },
    })
    expect(await res.json()).toEqual({ session: 'xyz789' })
  })

  it('programmatic headers override forwarded headers', async () => {
    const app = createApp()
    app.get('/page', async () => {
      const res = await app.request('/api/auth', {
        headers: { authorization: 'Bearer override' },
      })
      return res.json()
    })
    app.get('/api/auth', () => {
      const { authorization } = useAuthorization()
      return { auth: authorization }
    })

    const res = await app.request('/page', {
      headers: { authorization: 'Bearer original' },
    })
    expect(await res.json()).toEqual({ auth: 'Bearer override' })
  })

  it('forwardHeaders: false disables forwarding', async () => {
    const app = createApp({ forwardHeaders: false })
    app.get('/page', async () => {
      const res = await app.request('/api/auth')
      return res.json()
    })
    app.get('/api/auth', () => {
      const { authorization } = useAuthorization()
      return { auth: authorization || null }
    })

    const res = await app.request('/page', {
      headers: { authorization: 'Bearer secret' },
    })
    expect(await res.json()).toEqual({ auth: null })
  })

  it('custom forwardHeaders list is respected', async () => {
    const app = createApp({ forwardHeaders: ['x-custom-auth'] })
    app.get('/page', async () => {
      const res = await app.request('/api/check')
      return res.json()
    })
    app.get('/api/check', () => {
      const { headers } = useRequest()
      return {
        customAuth: headers['x-custom-auth'] || null,
        authorization: headers.authorization || null,
      }
    })

    const res = await app.request('/page', {
      headers: {
        'x-custom-auth': 'custom-token',
        authorization: 'Bearer should-not-forward',
      },
    })
    const json = await res.json()
    expect(json.customAuth).toBe('custom-token')
    expect(json.authorization).toBe(null)
  })

  it('no forwarding when called standalone (no active context)', async () => {
    const app = createApp()
    app.get('/api/auth', () => {
      const { authorization } = useAuthorization()
      return { auth: authorization || null }
    })

    // Called outside any HTTP context — no forwarding possible
    const res = await app.request('/api/auth')
    expect(await res.json()).toEqual({ auth: null })
  })

  it('auto-propagates set-cookie from inner fetch to parent response', async () => {
    const app = createApp()
    app.get('/page', async () => {
      await app.request('/api/login')
      return 'page content'
    })
    app.get('/api/login', () => {
      const response = useResponse()
      response.setCookie('session', 'new-token', { httpOnly: true })
      response.setCookie('refresh', 'ref-token')
      return { ok: true }
    })

    const res = await app.request('/page')
    const setCookies = res.headers.getSetCookie()
    expect(setCookies.length).toBe(2)
    expect(setCookies[0]).toContain('session=new-token')
    expect(setCookies[1]).toContain('refresh=ref-token')
  })

  it('cookies from multiple inner fetches are all propagated', async () => {
    const app = createApp()
    app.get('/page', async () => {
      await app.request('/api/auth')
      await app.request('/api/prefs')
      return 'page'
    })
    app.get('/api/auth', () => {
      useResponse().setCookie('session', 'tok')
      return 'ok'
    })
    app.get('/api/prefs', () => {
      useResponse().setCookie('theme', 'dark')
      return 'ok'
    })

    const res = await app.request('/page')
    const setCookies = res.headers.getSetCookie()
    expect(setCookies.length).toBe(2)
    expect(setCookies.some(c => c.includes('session=tok'))).toBe(true)
    expect(setCookies.some(c => c.includes('theme=dark'))).toBe(true)
  })

  it('inner cookies do not clobber outer cookies set before inner fetch', async () => {
    const app = createApp()
    app.get('/page', async () => {
      useResponse().setCookie('outer', 'outer-val')
      await app.request('/api/data')
      return 'page'
    })
    app.get('/api/data', () => {
      useResponse().setCookie('inner', 'inner-val')
      return 'ok'
    })

    const res = await app.request('/page')
    const setCookies = res.headers.getSetCookie()
    expect(setCookies.length).toBe(2)
    expect(setCookies.some(c => c.includes('outer=outer-val'))).toBe(true)
    expect(setCookies.some(c => c.includes('inner=inner-val'))).toBe(true)
  })

  it('cookie propagation does not happen when called standalone', async () => {
    const app = createApp()
    app.get('/api/set-cookie', () => {
      useResponse().setCookie('standalone', 'val')
      return 'ok'
    })

    // Called standalone — no parent to propagate to, should not throw
    const res = await app.request('/api/set-cookie')
    expect(res.status).toBe(200)
    const setCookies = res.headers.getSetCookie()
    expect(setCookies.some(c => c.includes('standalone=val'))).toBe(true)
  })

  it('forwards multiple default headers simultaneously', async () => {
    const app = createApp()
    app.get('/page', async () => {
      const res = await app.request('/api/headers')
      return res.json()
    })
    app.get('/api/headers', () => {
      const { headers } = useRequest()
      return {
        auth: headers.authorization || null,
        cookie: headers.cookie || null,
        lang: headers['accept-language'] || null,
        forwarded: headers['x-forwarded-for'] || null,
        reqId: headers['x-request-id'] || null,
      }
    })

    const res = await app.request('/page', {
      headers: {
        authorization: 'Bearer t',
        cookie: 'a=1',
        'accept-language': 'en-US',
        'x-forwarded-for': '1.2.3.4',
        'x-request-id': 'req-123',
      },
    })
    const json = await res.json()
    expect(json.auth).toBe('Bearer t')
    expect(json.cookie).toBe('a=1')
    expect(json.lang).toBe('en-US')
    expect(json.forwarded).toBe('1.2.3.4')
    expect(json.reqId).toBe('req-123')
  })
})

// --- Group 5: Response isolation ---

describe('Response isolation', () => {
  it('inner fetch status does not leak to outer response', async () => {
    const app = createApp()
    app.get('/page', async () => {
      const inner = await app.request('/api/not-found')
      expect(inner.status).toBe(404)
      return 'page rendered'
    })
    app.get('/api/not-found', () => {
      throw new HttpError(404, 'Not found')
    })

    const res = await app.request('/page')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('page rendered')
  })

  it('inner fetch response headers do not leak to outer response', async () => {
    const app = createApp()
    app.get('/page', async () => {
      await app.request('/api/with-headers')
      return 'page'
    })
    app.get('/api/with-headers', () => {
      useResponse().setHeader('x-inner-only', 'secret')
      return 'ok'
    })

    const res = await app.request('/page')
    expect(res.headers.get('x-inner-only')).toBe(null)
  })

  it('query parameters are preserved through fetch', async () => {
    const app = createApp()
    app.get('/search', () => {
      const { url } = useRequest()
      return { url }
    })

    const res = await app.request('/search?q=hello&page=2')
    const json = await res.json()
    expect(json.url).toBe('/search?q=hello&page=2')
  })

  it('inner fetch uses its own route params, not outer route params', async () => {
    const app = createApp()
    app.get('/page/:pageId', async () => {
      const { params: outerParams } = useRouteParams()
      const inner = await app.request('/api/items/99')
      const innerJson = await inner.json()
      return { outerPageId: outerParams.pageId, innerItemId: innerJson.itemId }
    })
    app.get('/api/items/:itemId', () => {
      const { params } = useRouteParams()
      return { itemId: params.itemId }
    })

    const res = await app.request('/page/5')
    const json = await res.json()
    expect(json.outerPageId).toBe('5')
    expect(json.innerItemId).toBe('99')
  })
})

// --- Group 6: Moost compatibility + error path ---

describe('Moost compatibility', () => {
  it('fakeReq emits end and close after handler completes', async () => {
    const app = createApp()
    const endSpy = vi.fn()
    const closeSpy = vi.fn()

    app.get('/events', () => {
      const { raw } = useRequest()
      raw.on('end', endSpy)
      raw.on('close', closeSpy)
      return 'ok'
    })

    await app.request('/events')
    expect(endSpy).toHaveBeenCalledOnce()
    expect(closeSpy).toHaveBeenCalledOnce()
  })

  it('fakeReq emits end even when handler throws', async () => {
    const app = createApp()
    const endSpy = vi.fn()

    app.get('/throw', () => {
      const { raw } = useRequest()
      raw.on('end', endSpy)
      throw new Error('boom')
    })

    const res = await app.request('/throw')
    expect(res.status).toBe(500)
    expect(endSpy).toHaveBeenCalledOnce()
  })

  it('unhandled error produces valid 500 response via toWebResponse()', async () => {
    const app = createApp()
    app.get('/error', () => {
      throw new Error('unhandled')
    })

    const res = await app.request('/error')
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.statusCode).toBe(500)
  })

  it('HttpError produces content-negotiated error response', async () => {
    const app = createApp()
    app.get('/forbidden', () => {
      throw new HttpError(403, 'Access denied')
    })

    const res = await app.request('/forbidden', {
      headers: { accept: 'application/json' },
    })
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.statusCode).toBe(403)
    expect(body.message).toBe('Access denied')
  })
})
