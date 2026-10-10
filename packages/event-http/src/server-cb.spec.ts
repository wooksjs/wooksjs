import {
  ContextInjector,
  replaceContextInjector,
  resetContextInjector,
  tryGetCurrent,
  useRouteParams,
} from '@wooksjs/event-core'
import { IncomingMessage, ServerResponse } from 'http'
import { Duplex } from 'stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Wooks } from 'wooks'

import { createHttpApp } from './http-adapter'
import { WooksHttpResponse } from './response/wooks-http-response'

class NoopSocket extends Duplex {
  _read(): void {}
  _write(_chunk: unknown, _enc: string, cb: () => void): void {
    cb()
  }
}

/** Calls a server callback with an in-memory request; resolves when the response ends. */
function dispatch(
  cb: (req: IncomingMessage, res: ServerResponse) => void,
  method: string,
  url: string,
): Promise<{ status: number; body: string }> {
  const req = new IncomingMessage(new NoopSocket() as never)
  req.method = method
  req.url = url
  req.headers = {}
  const res = new ServerResponse(req)
  return new Promise((resolve) => {
    const end = res.end.bind(res)
    res.end = ((chunk?: unknown, ...rest: unknown[]) => {
      resolve({ status: res.statusCode, body: chunk ? String(chunk) : '' })
      return end(chunk as never, ...(rest as []))
    }) as typeof res.end
    cb(req, res)
  })
}

function setup() {
  const created = vi.fn()
  class CountingResponse extends WooksHttpResponse {
    constructor(...args: ConstructorParameters<typeof WooksHttpResponse>) {
      super(...args)
      created()
    }
  }
  const onNotFound = vi.fn(() => 'custom not found')
  const app = createHttpApp({ responseClass: CountingResponse, onNotFound }, new Wooks())
  app.get('/users/:id', () => `user ${useRouteParams().params.id}`)

  const injector = new ContextInjector<string>()
  const withSpy = vi.spyOn(injector, 'with')
  const hookSpy = vi.spyOn(injector, 'hook')
  replaceContextInjector(injector)

  return { app, created, onNotFound, withSpy, hookSpy }
}

afterEach(() => {
  resetContextInjector()
})

describe('getServerCb(onNoMatch) — middleware mode', () => {
  it('hands an unmatched request to onNoMatch outside any event context, without a response', async () => {
    const { app, created, onNotFound, withSpy, hookSpy } = setup()
    let ctxInside: unknown = 'not called'
    const onNoMatch = vi.fn((_req: IncomingMessage, res: ServerResponse) => {
      ctxInside = tryGetCurrent()
      res.statusCode = 418
      res.end('host app')
    })

    const result = await dispatch(app.getServerCb(onNoMatch), 'GET', '/assets/app.js')

    expect(result).toEqual({ status: 418, body: 'host app' })
    expect(onNoMatch).toHaveBeenCalledOnce()
    expect(ctxInside).toBeUndefined()
    expect(created).not.toHaveBeenCalled()
    expect(withSpy).not.toHaveBeenCalled()
    expect(hookSpy).not.toHaveBeenCalled()
    expect(onNotFound).not.toHaveBeenCalled()
  })

  it('runs matched handlers in an event context with route params', async () => {
    const { app, created, withSpy, hookSpy } = setup()
    const onNoMatch = vi.fn()

    const result = await dispatch(app.getServerCb(onNoMatch), 'GET', '/users/42')

    expect(result).toMatchObject({ status: 200, body: 'user 42' })
    expect(onNoMatch).not.toHaveBeenCalled()
    expect(created).toHaveBeenCalledOnce()
    expect(withSpy).toHaveBeenCalledOnce()
    expect(withSpy.mock.calls[0][0]).toBe('Event:start')
    expect(hookSpy).toHaveBeenCalledOnce()
    expect(hookSpy).toHaveBeenCalledWith('GET', 'Handler:routed', '/users/:id')
  })

  it('routes malformed percent-encoding without throwing', async () => {
    const { app } = setup()
    const onNoMatch = vi.fn((_req: IncomingMessage, res: ServerResponse) => res.end('host app'))
    const cb = app.getServerCb(onNoMatch)

    expect(await dispatch(cb, 'GET', '/users/%E0%A4%A')).toMatchObject({
      status: 200,
      body: 'user %E0%A4%A',
    })
    expect(await dispatch(cb, 'GET', '/%zz')).toMatchObject({ body: 'host app' })
  })
})

describe('getServerCb() — standalone server', () => {
  it('runs matched handlers with route params', async () => {
    const { app, created, hookSpy } = setup()

    const result = await dispatch(app.getServerCb(), 'GET', '/users/7')

    expect(result).toMatchObject({ status: 200, body: 'user 7' })
    expect(created).toHaveBeenCalledOnce()
    expect(hookSpy).toHaveBeenCalledWith('GET', 'Handler:routed', '/users/:id')
  })

  it('serves an unmatched request with onNotFound inside an event context', async () => {
    const { app, created, onNotFound, withSpy, hookSpy } = setup()

    const result = await dispatch(app.getServerCb(), 'GET', '/missing')

    expect(result).toMatchObject({ body: 'custom not found' })
    expect(onNotFound).toHaveBeenCalledOnce()
    expect(created).toHaveBeenCalledOnce()
    expect(withSpy).toHaveBeenCalledOnce()
    expect(hookSpy).toHaveBeenCalledWith('GET', 'Handler:not_found')
  })

  it('responds 404 inside an event context when no onNotFound is set', async () => {
    const app = createHttpApp({}, new Wooks())
    const injector = new ContextInjector<string>()
    const hookSpy = vi.spyOn(injector, 'hook')
    replaceContextInjector(injector)

    const result = await dispatch(app.getServerCb(), 'GET', '/missing')

    expect(result.status).toBe(404)
    expect(hookSpy).toHaveBeenCalledWith('GET', 'Handler:not_found')
  })
})

describe('fetch() — unmatched route', () => {
  it('returns null before any event context is created, leaving the body unread', async () => {
    const { app, created, withSpy, hookSpy } = setup()
    const request = new Request('http://localhost/missing', { method: 'POST', body: 'payload' })

    expect(await app.fetch(request)).toBeNull()
    expect(request.bodyUsed).toBe(false)
    expect(created).not.toHaveBeenCalled()
    expect(withSpy).not.toHaveBeenCalled()
    expect(hookSpy).not.toHaveBeenCalled()
  })

  it('still resolves route params for a matched route', async () => {
    const { app, hookSpy } = setup()

    const response = await app.request('/users/5')

    expect(await response?.text()).toBe('user 5')
    expect(hookSpy).toHaveBeenCalledWith('GET', 'Handler:routed', '/users/:id')
  })
})
