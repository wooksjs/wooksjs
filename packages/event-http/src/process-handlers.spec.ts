import { ContextInjector, replaceContextInjector, resetContextInjector } from '@wooksjs/event-core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Wooks } from 'wooks'
import { gunzipSync } from 'zlib'

import { dispatch } from './__tests__/dispatch'
import { HttpError } from './errors'
import { createHttpApp } from './http-adapter'

/**
 * Dispatches an in-memory request through `getServerCb()` and resolves with the value the event
 * callback settled with (captured through a ContextInjector), whether the response had already
 * ended by then, and the `ended` response promise.
 */
async function run(
  app: ReturnType<typeof createHttpApp>,
  url: string,
  headers: Record<string, string> = {},
) {
  let returned: unknown
  const injector = new ContextInjector<string>()
  vi.spyOn(injector, 'with').mockImplementation(((
    _name: string,
    attrs: unknown,
    cb?: () => unknown,
  ) => {
    returned = (typeof attrs === 'function' ? attrs : cb!)()
    return returned
  }) as never)
  replaceContextInjector(injector)

  const { res, ended } = dispatch(app.getServerCb(), { url, headers })
  const result = await returned
  return { result, endedFirst: res.writableEnded, ended }
}

function setup(compression = false) {
  const logger = {
    log: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
  }
  const app = createHttpApp({ logger: logger as never, compression }, new Wooks())
  return { app, logger }
}

// Some tests register the same route on purpose; mute the router's "Duplicate route" notice
// (@prostojs/router prints it with console.info and takes no logger)
beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  resetContextInjector()
})

describe('async handler results', () => {
  it.each([
    {
      name: 'a rejected HttpError without logging',
      error: new HttpError(401, 'Unauthorized'),
      status: 401,
      payload: { statusCode: 401, message: 'Unauthorized', error: 'Unauthorized' },
      logged: false,
    },
    {
      name: 'a rejected Error with 500 and logs it',
      error: new Error('boom'),
      status: 500,
      payload: { statusCode: 500, message: 'boom' },
      logged: true,
    },
  ])('responds to $name and settles with the same error', async (c) => {
    const { app, logger } = setup()
    app.get('/fail', async () => {
      throw c.error
    })
    const { result, ended } = await run(app, '/fail')
    const { status, text } = await ended
    expect(status).toBe(c.status)
    expect(JSON.parse(text)).toMatchObject(c.payload)
    expect(result).toBe(c.error)
    if (c.logged) {
      expect(logger.error).toHaveBeenCalledTimes(1)
      expect(logger.error).toHaveBeenCalledWith('Uncaught route handler exception: /fail', c.error)
    } else {
      expect(logger.error).not.toHaveBeenCalled()
    }
  })

  it('settles only after a compressed body is written', async () => {
    const { app } = setup(true)
    const text = 'compress me '.repeat(200)
    app.get('/big', async () => text)
    const { result, endedFirst, ended } = await run(app, '/big', { 'accept-encoding': 'gzip' })
    const { status, body } = await ended
    expect(status).toBe(200)
    expect(gunzipSync(body).toString()).toBe(text)
    expect(result).toBe(text)
    expect(endedFirst).toBe(true)
  })

  it('treats a throwing respond() like a handler failure', async () => {
    const { app, logger } = setup()
    app.get('/bad-body', async () => Symbol('unsupported'))
    const { result } = await run(app, '/bad-body')
    expect(result).toBeInstanceOf(Error)
    expect((result as Error).message).toBe('Unsupported body format "symbol"')
    expect(logger.error).toHaveBeenCalledWith('Uncaught route handler exception: /bad-body', result)
  })
})

describe('multiple async handlers', () => {
  it('runs the next handler after a rejection and responds with its result', async () => {
    const { app, logger } = setup()
    const calls: string[] = []
    app.get('/chain', async () => {
      calls.push('first')
      throw new HttpError(403)
    })
    app.get('/chain', () => {
      calls.push('second')
      return 'second'
    })
    const { result, ended } = await run(app, '/chain')
    const { status, text } = await ended
    expect(calls).toEqual(['first', 'second'])
    expect(status).toBe(200)
    expect(text).toBe('second')
    expect(result).toBe('second')
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('catches a sync throw of the next handler and responds with the last error', async () => {
    const { app, logger } = setup()
    const first = new Error('first')
    const last = new HttpError(409, 'last')
    app.get('/chain', async () => {
      throw first
    })
    app.get('/chain', () => {
      throw last
    })
    const { result, ended } = await run(app, '/chain')
    const { status } = await ended
    expect(status).toBe(409)
    expect(result).toBe(last)
    expect(logger.error).toHaveBeenCalledTimes(1)
    expect(logger.error).toHaveBeenCalledWith('Uncaught route handler exception: /chain', first)
  })

  it('continues through several async handlers until one succeeds', async () => {
    const { app } = setup()
    app.get('/chain', async () => {
      throw new HttpError(404)
    })
    app.get('/chain', async () => {
      throw new HttpError(404)
    })
    app.get('/chain', async () => 'third')
    const { status, text } = await (await run(app, '/chain')).ended
    expect(status).toBe(200)
    expect(text).toBe('third')
  })
})
