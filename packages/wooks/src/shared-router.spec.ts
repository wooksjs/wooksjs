import type { TConsoleBase } from '@prostojs/logger'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { TWooksHandler } from './types'
import { clearGlobalWooks, getGlobalWooks, Wooks, WooksAdapterBase } from './wooks'

/** A minimal adapter: routes under `method`, created with or without a Wooks instance. */
class TestAdapter extends WooksAdapterBase {
  constructor(
    readonly method: string,
    logger: TConsoleBase,
    wooks?: Wooks | WooksAdapterBase,
  ) {
    super(wooks, logger)
  }

  route(path: string, handler: TWooksHandler) {
    return this.on(this.method, path, handler)
  }

  /** The handlers the shared router keeps for `path`, in order. */
  handlersFor(path: string) {
    return this.getWooks().matchRoute(this.method, path)?.route.handlers ?? null
  }
}

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

function handler(name: string): TWooksHandler {
  return () => name
}

beforeEach(() => {
  clearGlobalWooks()
})

describe('shared global router: duplicate route across apps', () => {
  it('warns once when a second app registers a route the first app has; the first serves it', () => {
    const logger = makeLogger()
    const first = new TestAdapter('GET', logger)
    const second = new TestAdapter('GET', logger)
    const a = handler('first')
    const b = handler('second')

    first.route('/users/:id', a)
    second.route('/users/:id', b)

    expect(logger.warn).toHaveBeenCalledOnce()
    const message = logger.warn.mock.calls[0][0] as string
    expect(message).toContain('GET /users/:id')
    expect(message).toContain('already registered by another app')
    expect(message).toContain('clearGlobalWooks()')
    // one router, one handler list: the first app's handler is the one that runs
    expect(second.getWooks()).toBe(first.getWooks())
    expect(second.handlersFor('/users/42')).toEqual([a, b])
  })

  it('uses the router notion of a route: /users/:id and /users/:uid are one route', () => {
    const logger = makeLogger()
    new TestAdapter('GET', logger).route('/users/:id', handler('first'))
    new TestAdapter('GET', logger).route('users/:uid/', handler('second'))

    expect(logger.warn).toHaveBeenCalledOnce()
    expect(logger.warn.mock.calls[0][0]).toContain('GET users/:uid/')
  })

  it('logs once per app, however many routes it shares', () => {
    const logger = makeLogger()
    const first = new TestAdapter('GET', logger)
    const second = new TestAdapter('GET', logger)

    for (const path of ['/a', '/b/:id', '/c']) {
      first.route(path, handler('first'))
    }
    for (const path of ['/a', '/b/:id', '/c', '/a']) {
      second.route(path, handler('second'))
    }
    first.route('/a', handler('first again'))

    expect(logger.warn).toHaveBeenCalledOnce()
    const message = logger.warn.mock.calls[0][0] as string
    expect(message).toContain('"GET /a"')
    expect(message).toContain('Other routes this app shares with another app are not listed')
  })

  it('gives a third app colliding on the router its own warning', () => {
    const secondLogger = makeLogger()
    const thirdLogger = makeLogger()
    const first = new TestAdapter('GET', makeLogger())
    const second = new TestAdapter('GET', secondLogger)
    const third = new TestAdapter('GET', thirdLogger)

    first.route('/x', handler('first'))
    second.route('/x', handler('second'))
    second.route('/y', handler('second'))
    third.route('/y', handler('third'))
    third.route('/x', handler('third'))

    expect(secondLogger.warn).toHaveBeenCalledOnce()
    expect(secondLogger.warn.mock.calls[0][0]).toContain('"GET /x"')
    expect(thirdLogger.warn).toHaveBeenCalledOnce()
    expect(thirdLogger.warn.mock.calls[0][0]).toContain('"GET /y"')
  })

  it('warns an app on the global router when an adapter built from another app registered first', () => {
    const logger = makeLogger()
    const host = new TestAdapter('HOST', makeLogger())
    new TestAdapter('GET', makeLogger(), host).route('/x', handler('built from host'))
    new TestAdapter('GET', logger).route('/x', handler('second'))

    expect(logger.warn).toHaveBeenCalledOnce()
  })

  it('warns an app on the global router when an app given that Wooks registered first', () => {
    const explicitLogger = makeLogger()
    const logger = makeLogger()
    const explicit = new TestAdapter('GET', explicitLogger, getGlobalWooks())
    explicit.route('/x', handler('explicit'))
    new TestAdapter('GET', logger).route('/x', handler('second'))
    // an app given a Wooks shares it on purpose: it never warns itself
    explicit.route('/y', handler('explicit'))

    expect(logger.warn).toHaveBeenCalledOnce()
    expect(explicitLogger.warn).not.toHaveBeenCalled()
  })

  it('counts an adapter built from another as part of that app: one warning per app', () => {
    const logger = makeLogger()
    const first = new TestAdapter('GET', makeLogger())
    const second = new TestAdapter('GET', logger)
    first.route('/x', handler('first'))
    new TestAdapter('CLI', makeLogger(), first).route('/start', handler('first cli'))

    new TestAdapter('CLI', logger, second).route('/start', handler('second cli'))
    second.route('/x', handler('second'))

    expect(logger.warn).toHaveBeenCalledOnce()
    expect(logger.warn.mock.calls[0][0]).toContain('"CLI /start"')
  })

  it('names the methods a "*" route shares with another app', () => {
    const logger = makeLogger()
    new TestAdapter('GET', logger).route('/x', handler('first'))
    new TestAdapter('*', logger).route('/x', handler('second'))

    expect(logger.warn).toHaveBeenCalledOnce()
    expect(logger.warn.mock.calls[0][0]).toContain('"GET /x"')
  })

  it('finds the route of each method a "*" route covers, also a case variant under ignoreCase', () => {
    getGlobalWooks(undefined, { ignoreCase: true })
    const logger = makeLogger()
    new TestAdapter('PUT', makeLogger()).route('/Users', handler('first'))
    new TestAdapter('*', logger).route('/users', handler('second'))

    expect(logger.warn).toHaveBeenCalledOnce()
    expect(logger.warn.mock.calls[0][0]).toContain('"PUT /users"')
  })

  it('stays silent when the same app registers a route again (a handler chain)', () => {
    const logger = makeLogger()
    const app = new TestAdapter('GET', logger)
    const a = handler('a')
    const b = handler('b')

    app.route('/x', a)
    app.route('/x', b)

    expect(logger.warn).not.toHaveBeenCalled()
    expect(app.handlersFor('/x')).toEqual([a, b])
  })

  it('stays silent for two apps that each have their own Wooks', () => {
    const logger = makeLogger()
    new TestAdapter('GET', logger, new Wooks()).route('/x', handler('first'))
    new TestAdapter('GET', logger, new Wooks()).route('/x', handler('second'))

    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('stays silent after clearGlobalWooks() between the apps', () => {
    const logger = makeLogger()
    const first = new TestAdapter('GET', logger)
    first.route('/x', handler('first'))
    clearGlobalWooks()
    const second = new TestAdapter('GET', logger)
    second.route('/x', handler('second'))

    expect(logger.warn).not.toHaveBeenCalled()
    expect(second.getWooks()).not.toBe(first.getWooks())
  })

  it('stays silent for adapters of different event types on one Wooks', () => {
    const logger = makeLogger()
    const wooks = new Wooks()
    new TestAdapter('GET', logger, wooks).route('/start', handler('http'))
    new TestAdapter('CLI', logger, wooks).route('/start', handler('cli'))
    // the same on the global router: the method is part of the route
    new TestAdapter('GET', logger).route('/start', handler('http'))
    new TestAdapter('CLI', logger).route('/start', handler('cli'))

    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('stays silent when an app shares a router on purpose (Wooks or adapter passed in)', () => {
    const logger = makeLogger()
    const first = new TestAdapter('GET', logger)
    first.route('/x', handler('first'))
    new TestAdapter('GET', logger, first).route('/x', handler('second'))
    new TestAdapter('GET', logger, getGlobalWooks()).route('/x', handler('third'))

    expect(logger.warn).not.toHaveBeenCalled()
    expect(first.handlersFor('/x')).toHaveLength(3)
  })
})
