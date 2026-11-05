import { Agent, request as httpRequest } from 'node:http'
import type { ServerResponse } from 'node:http'
import { connect } from 'node:net'
import { Readable } from 'node:stream'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { Wooks } from 'wooks'

import { useRequest } from '../composables/request'
import { useResponse } from '../composables/response'
import { HttpError } from '../errors'
import { createEventContext, current } from '@wooksjs/event-core'

import { createHttpApp } from '../http-adapter'
import type { THttpResponseCloseInfo } from './close'
import { WooksHttpResponse } from './wooks-http-response'

type TApp = ReturnType<typeof createHttpApp>

function makeLogger() {
  return {
    log: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
  }
}

function createApp(logger = makeLogger()) {
  return createHttpApp({ logger: logger as never }, new Wooks({ logger: logger as never }))
}

/** A stream that emits `chunk-N;` every 5 ms, `count` times (forever without `count`). */
function ticking(count?: number, onTick?: (i: number) => void) {
  let i = 0
  return new Readable({
    read() {
      setTimeout(() => {
        onTick?.(i)
        this.push(count !== undefined && i >= count ? null : `chunk-${i++};`)
      }, 5)
    },
  })
}

/** A one-chunk byte stream (readable with a BYOB reader). */
function bytes() {
  return new ReadableStream({
    type: 'bytes',
    pull(controller) {
      controller.enqueue(new Uint8Array([1, 2, 3]))
      controller.close()
    },
  })
}

describe('HttpResponse.onClose on a real server', () => {
  let app: TApp | undefined
  afterEach(async () => {
    await app?.close()
    app = undefined
  })

  async function start(setup: (a: TApp) => void, logger = makeLogger()) {
    app = createApp(logger)
    setup(app)
    await app.listen(0)
    const { port } = app.getServer()!.address() as { port: number }
    return { base: `http://127.0.0.1:${port}`, port }
  }

  it('fires once with finished: true after a regular body is sent', async () => {
    const closed = vi.fn<(info: THttpResponseCloseInfo) => void>()
    const { base } = await start((a) =>
      a.get('/ok', () => {
        useResponse().onClose(closed)
        return 'ok'
      }),
    )
    const res = await fetch(`${base}/ok`)
    expect(await res.text()).toBe('ok')
    await vi.waitFor(() => expect(closed).toHaveBeenCalledTimes(1))
    expect(closed).toHaveBeenCalledWith({ finished: true })
  })

  it('fires once with finished: true for an error response', async () => {
    const closed = vi.fn<(info: THttpResponseCloseInfo) => void>()
    const { base } = await start((a) =>
      a.get('/err', () => {
        useResponse().onClose(closed)
        throw new HttpError(409, 'conflict')
      }),
    )
    const res = await fetch(`${base}/err`)
    expect(res.status).toBe(409)
    await res.text()
    await vi.waitFor(() => expect(closed).toHaveBeenCalledTimes(1))
    expect(closed).toHaveBeenCalledWith({ finished: true })
  })

  it('fires only once the last byte of a streamed body is sent', async () => {
    const closed = vi.fn<(info: THttpResponseCloseInfo) => void>()
    let returned = false
    const { base } = await start((a) =>
      a.get('/s', () => {
        useResponse().onClose(closed)
        returned = true
        return ticking(5)
      }),
    )
    const res = await fetch(`${base}/s`)
    expect(returned).toBe(true)
    expect(closed).not.toHaveBeenCalled() // the handler returned, the body is still streaming
    expect(await res.text()).toBe('chunk-0;chunk-1;chunk-2;chunk-3;chunk-4;')
    await vi.waitFor(() => expect(closed).toHaveBeenCalledTimes(1))
    expect(closed).toHaveBeenCalledWith({ finished: true })
  })

  it('fires with finished: false when the client aborts a streamed body', async () => {
    const started = Promise.withResolvers<void>()
    const closed = Promise.withResolvers<THttpResponseCloseInfo>()
    const { base } = await start((a) =>
      a.get('/s', () => {
        useResponse().onClose(closed.resolve)
        return ticking(undefined, (i) => i === 1 && started.resolve())
      }),
    )
    const ac = new AbortController()
    const res = await fetch(`${base}/s`, { signal: ac.signal })
    expect(res.ok).toBe(true)
    await started.promise
    ac.abort()
    expect(await closed.promise).toEqual({ finished: false })
  })

  it('reports the error of a body stream that fails mid-body', async () => {
    const closed = Promise.withResolvers<THttpResponseCloseInfo>()
    const failure = new Error('source failed')
    const { base } = await start((a) =>
      a.get('/e', () => {
        useResponse().onClose(closed.resolve)
        let i = 0
        return new Readable({
          read() {
            setTimeout(() => (i++ < 2 ? this.push('chunk;') : this.destroy(failure)), 5)
          },
        })
      }),
    )
    const res = await fetch(`${base}/e`)
    await expect(res.text()).rejects.toThrow()
    expect(await closed.promise).toEqual({ finished: false, error: failure })
  })

  it('runs a callback registered after the client left at once, in the event context', async () => {
    const gone = Promise.withResolvers<void>()
    const closed = Promise.withResolvers<THttpResponseCloseInfo>()
    let url: string | undefined
    let ranSync = false
    const { base } = await start((a) =>
      a.get('/late', async () => {
        const res = useResponse().getRawRes(true)
        res.once('close', () => gone.resolve())
        await gone.promise
        await new Promise((resolve) => setImmediate(resolve)) // leave the 'close' emit
        useResponse().onClose((info) => {
          url = useRequest().url
          closed.resolve(info)
        })
        ranSync = url !== undefined
        return 'too late'
      }),
    )
    const ac = new AbortController()
    const pending = fetch(`${base}/late`, { signal: ac.signal }).catch(() => undefined)
    await new Promise((resolve) => setTimeout(resolve, 20))
    ac.abort()
    await pending
    expect(await closed.promise).toEqual({ finished: false })
    expect(url).toBe('/late')
    await vi.waitFor(() => expect(ranSync).toBe(true))
  })

  it('runs callbacks inside the request event context', async () => {
    const seen = Promise.withResolvers<string | undefined>()
    const { base } = await start((a) =>
      a.get('/ctx', () => {
        useResponse().onClose(() => seen.resolve(useRequest().url))
        return 'ok'
      }),
    )
    await (await fetch(`${base}/ctx?x=1`)).text()
    expect(await seen.promise).toBe('/ctx?x=1')
  })

  it('logs a throwing or rejecting callback; the others still run and the server keeps serving', async () => {
    const logger = makeLogger()
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    try {
      const after = vi.fn()
      const { base } = await start((a) => {
        a.get('/boom', () => {
          const response = useResponse()
          response.onClose(() => {
            throw new Error('sync boom')
          })
          response.onClose(() => Promise.reject(new Error('async boom')))
          response.onClose(after)
          return 'ok'
        })
        a.get('/next', () => 'next')
      }, logger)
      expect(await (await fetch(`${base}/boom`)).text()).toBe('ok')
      await vi.waitFor(() => expect(logger.error).toHaveBeenCalledTimes(2))
      expect(after).toHaveBeenCalledTimes(1)
      const messages = logger.error.mock.calls.map((c) => (c[1] as Error).message).toSorted()
      expect(messages).toEqual(['async boom', 'sync boom'])
      expect(await (await fetch(`${base}/next`)).text()).toBe('next')
      await new Promise((resolve) => setTimeout(resolve, 10))
      expect(unhandled).not.toHaveBeenCalled()
    } finally {
      process.off('unhandledRejection', unhandled)
    }
  })

  it('leaves no listeners behind on a keep-alive connection', async () => {
    const raws: ServerResponse[] = []
    let calls = 0
    const { port } = await start((a) =>
      a.get('/k', () => {
        const response = useResponse()
        raws.push(response.getRawRes(true))
        response.onClose(() => calls++)
        response.onClose(() => calls++)
        return 'k'
      }),
    )
    const agent = new Agent({ keepAlive: true, maxSockets: 1 })
    const get = () =>
      new Promise<void>((resolve, reject) => {
        httpRequest({ port, path: '/k', agent }, (res) => {
          res.resume()
          res.on('end', resolve)
        })
          .on('error', reject)
          .end()
      })
    try {
      await get()
      const connection = raws[0].req.socket
      const baseline = connection.listenerCount('close')
      for (let i = 1; i < 15; i++) {
        await get()
      }
      await vi.waitFor(() => expect(calls).toBe(30))
      // one connection served every request
      expect(new Set(raws.map((r) => r.req.socket)).size).toBe(1)
      // no per-request listener stays on the shared connection, none on the responses
      expect(connection.listenerCount('close')).toBe(baseline)
      for (const res of raws) {
        expect(res.listenerCount('close')).toBe(0)
      }
    } finally {
      agent.destroy()
    }
  })

  it('fires for a pipelined request whose client disconnects while it is still queued', async () => {
    const firstStarted = Promise.withResolvers<void>()
    const secondRegistered = Promise.withResolvers<void>()
    const first = Promise.withResolvers<THttpResponseCloseInfo>()
    const second = Promise.withResolvers<THttpResponseCloseInfo>()
    const { port } = await start((a) => {
      a.get('/slow', async () => {
        useResponse().onClose(first.resolve)
        firstStarted.resolve()
        await new Promise((resolve) => setTimeout(resolve, 200))
        return 'slow'
      })
      a.get('/queued', () => {
        // queued behind /slow: the response has no socket yet
        expect(useResponse().getRawRes(true).socket).toBeNull()
        useResponse().onClose(second.resolve)
        secondRegistered.resolve()
        return 'queued'
      })
    })
    const socket = connect(port, '127.0.0.1')
    await new Promise<void>((resolve) => socket.once('connect', () => resolve()))
    socket.write('GET /slow HTTP/1.1\r\nHost: x\r\n\r\nGET /queued HTTP/1.1\r\nHost: x\r\n\r\n')
    await firstStarted.promise
    await secondRegistered.promise
    socket.destroy()
    expect(await second.promise).toEqual({ finished: false })
    expect(await first.promise).toEqual({ finished: false })
  })

  it('reports finished: false when a handler destroys the response with an error', async () => {
    const closed = Promise.withResolvers<THttpResponseCloseInfo>()
    const failure = new Error('handler gave up')
    const { base } = await start((a) =>
      a.get('/destroy', () => {
        const response = useResponse()
        response.onClose(closed.resolve)
        response.getRawRes(true).destroy(failure)
      }),
    )
    await fetch(`${base}/destroy`).catch(() => undefined)
    expect(await closed.promise).toEqual({ finished: false, error: failure })
  })

  it('runs each callback in the event context it was registered in', async () => {
    const seen: unknown[] = []
    const done = Promise.withResolvers<void>()
    let other: unknown
    const { base } = await start((a) =>
      a.get('/two', () => {
        const response = useResponse()
        response.onClose(() => seen.push(current()))
        const request = current()
        createEventContext({ logger: request.logger }, () => {
          other = current()
          response.onClose(() => {
            seen.push(current())
            done.resolve()
          })
        })
        seen.unshift(request)
        return 'ok'
      }),
    )
    await (await fetch(`${base}/two`)).text()
    await done.promise
    const [request, first, second] = seen
    expect(first).toBe(request)
    expect(second).toBe(other)
    expect(second).not.toBe(request)
  })
})

describe('HttpResponse.onClose for in-process fetch', () => {
  it('fires with finished: true by the time fetch() resolves for a regular body', async () => {
    const app = createApp()
    const closed = vi.fn<(info: THttpResponseCloseInfo) => void>()
    app.get('/ok', () => {
      useResponse().onClose(closed)
      return { ok: true }
    })
    const res = await app.request('/ok')
    expect(closed).toHaveBeenCalledTimes(1)
    expect(closed).toHaveBeenCalledWith({ finished: true })
    expect(await res!.json()).toEqual({ ok: true })
  })

  it('fires with finished: true for an error response', async () => {
    const app = createApp()
    const closed = vi.fn<(info: THttpResponseCloseInfo) => void>()
    app.get('/err', async () => {
      useResponse().onClose(closed)
      throw new HttpError(404, 'nope')
    })
    const res = await app.request('/err')
    expect(res!.status).toBe(404)
    expect(closed).toHaveBeenCalledWith({ finished: true })
  })

  it('fires once a streamed Readable body is read to its end', async () => {
    const app = createApp()
    const closed = vi.fn<(info: THttpResponseCloseInfo) => void>()
    app.get('/s', () => {
      useResponse().onClose(closed)
      return ticking(3)
    })
    const res = await app.request('/s')
    expect(closed).not.toHaveBeenCalled()
    expect(await res!.text()).toBe('chunk-0;chunk-1;chunk-2;')
    expect(closed).toHaveBeenCalledTimes(1)
    expect(closed).toHaveBeenCalledWith({ finished: true })
  })

  it('fires with finished: false when the caller cancels a streamed body', async () => {
    const app = createApp()
    const closed = vi.fn<(info: THttpResponseCloseInfo) => void>()
    const source = ticking()
    app.get('/s', () => {
      useResponse().onClose(closed)
      return source
    })
    const res = await app.request('/s')
    const reader = res!.body!.getReader()
    await reader.read()
    await reader.cancel()
    expect(closed).toHaveBeenCalledWith({ finished: false })
    await vi.waitFor(() => expect(source.destroyed).toBe(true))
  })

  it('reports the error of a streamed body that fails', async () => {
    const app = createApp()
    const failure = new Error('source failed')
    const closed = vi.fn<(info: THttpResponseCloseInfo) => void>()
    app.get('/e', () => {
      useResponse().onClose(closed)
      let i = 0
      return new Readable({
        read() {
          setTimeout(() => (i++ < 1 ? this.push('chunk;') : this.destroy(failure)), 5)
        },
      })
    })
    const res = await app.request('/e')
    await expect(res!.text()).rejects.toThrow()
    expect(closed).toHaveBeenCalledWith({ finished: false, error: failure })
  })

  it('tracks a returned fetch Response body and keeps status and headers', async () => {
    const app = createApp()
    const closed = vi.fn<(info: THttpResponseCloseInfo) => void>()
    app.get('/f', () => {
      useResponse().onClose(closed)
      useResponse().setCookie('a', '1')
      useResponse().setCookie('b', '2')
      return new Response(Readable.toWeb(ticking(2)) as ReadableStream, {
        status: 202,
        headers: { 'x-from': 'inner' },
      })
    })
    const res = await app.request('/f')
    expect(res!.status).toBe(202)
    expect(res!.headers.get('x-from')).toBe('inner')
    expect(res!.headers.getSetCookie()).toHaveLength(2)
    expect(closed).not.toHaveBeenCalled()
    expect(await res!.text()).toBe('chunk-0;chunk-1;')
    expect(closed).toHaveBeenCalledWith({ finished: true })
  })

  it('fires right away for a HEAD request to a streamed route', async () => {
    const app = createApp()
    const closed = vi.fn<(info: THttpResponseCloseInfo) => void>()
    app.on('HEAD', '/s', () => {
      useResponse().onClose(closed)
      return ticking(2)
    })
    const res = await app.request('/s', { method: 'HEAD' })
    expect(res!.body).toBeNull()
    expect(closed).toHaveBeenCalledWith({ finished: true })
  })

  it('fires for an SSR-style nested fetch inside a real request, independently of the outer response', async () => {
    const app = createApp()
    const inner = vi.fn<(info: THttpResponseCloseInfo) => void>()
    const outer = Promise.withResolvers<THttpResponseCloseInfo>()
    app.get('/api', () => {
      useResponse().onClose(inner)
      return 'data'
    })
    app.get('/page', async () => {
      useResponse().onClose(outer.resolve)
      const data = await (await app.request('/api'))!.text()
      expect(inner).toHaveBeenCalledWith({ finished: true })
      return `<p>${data}</p>`
    })
    await app.listen(0)
    try {
      const { port } = app.getServer()!.address() as { port: number }
      expect(await (await fetch(`http://127.0.0.1:${port}/page`)).text()).toBe('<p>data</p>')
      expect(await outer.promise).toEqual({ finished: true })
      expect(inner).toHaveBeenCalledTimes(1)
    } finally {
      await app.close()
    }
  })

  it('fires finished: false when the in-process dispatch itself fails', async () => {
    const failure = new Error('send failed')
    class FailingResponse extends WooksHttpResponse {
      override send(): void {
        throw failure
      }
    }
    const logger = makeLogger()
    const app = createHttpApp(
      { logger: logger as never, responseClass: FailingResponse },
      new Wooks({ logger: logger as never }),
    )
    const closed = vi.fn<(info: THttpResponseCloseInfo) => void>()
    app.get('/x', async () => {
      useResponse().onClose(closed)
      return 'x'
    })
    await expect(app.request('/x')).rejects.toBe(failure)
    expect(closed).toHaveBeenCalledWith({ finished: false, error: failure })
  })

  it('fires finished: false when building the in-process response fails', async () => {
    const failure = new Error('render failed')
    class FailingResponse extends WooksHttpResponse {
      override toWebResponse(): Response {
        throw failure
      }
    }
    const logger = makeLogger()
    const app = createHttpApp(
      { logger: logger as never, responseClass: FailingResponse },
      new Wooks({ logger: logger as never }),
    )
    const closed = vi.fn<(info: THttpResponseCloseInfo) => void>()
    app.get('/x', () => {
      useResponse().onClose(closed)
      return 'x'
    })
    await expect(app.request('/x')).rejects.toBe(failure)
    expect(closed).toHaveBeenCalledWith({ finished: false, error: failure })
  })

  it('leaves a streamed body untouched when nothing waits for the close (BYOB readers work)', async () => {
    const app = createApp()
    app.get('/plain', () => new Response(bytes()))
    const res = await app.request('/plain')
    const reader = res!.body!.getReader({ mode: 'byob' })
    const { value } = await reader.read(new Uint8Array(4))
    expect([...value!]).toEqual([1, 2, 3])
  })

  it('fires at once for a callback registered after fetch() handed the response over', async () => {
    const app = createApp()
    let response: ReturnType<typeof useResponse> | undefined
    app.get('/ok', () => {
      response = useResponse()
      return 'ok'
    })
    await app.request('/ok')
    const closed = vi.fn<(info: THttpResponseCloseInfo) => void>()
    response!.onClose(closed)
    expect(closed).toHaveBeenCalledWith({ finished: true })
  })
})
