import type { TConsoleBase } from '@prostojs/logger'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearGlobalWooks, getGlobalWooks } from 'wooks'

import { HttpError } from './errors'
import { createHttpApp } from './http-adapter'

function makeLogger() {
  return {
    log: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
  } satisfies TConsoleBase
}

beforeEach(() => {
  clearGlobalWooks()
})

describe('HTTP apps on the shared global router', () => {
  it('warns when a second app registers a route the first has, and the first app answers', async () => {
    const logger = makeLogger()
    const first = createHttpApp({ logger })
    const second = createHttpApp({ logger })
    first.get('/users/:id', () => 'first')
    second.get('/users/:id', () => 'second')

    expect(logger.warn).toHaveBeenCalledOnce()
    expect(logger.warn.mock.calls[0][0]).toContain('"GET /users/:id" is already registered')
    const res = await second.request('/users/42')
    expect(await res!.text()).toBe('first')
  })

  it('warns an app whose route an app given the global Wooks registered first', async () => {
    const logger = makeLogger()
    const explicit = createHttpApp({ logger }, getGlobalWooks())
    const second = createHttpApp({ logger })
    explicit.get('/x', () => 'explicit')
    second.get('/x', () => 'second')

    expect(logger.warn).toHaveBeenCalledOnce()
    expect(logger.warn.mock.calls[0][0]).toContain('"GET /x" is already registered')
    const res = await second.request('/x')
    expect(await res!.text()).toBe('explicit')
  })

  it('warns an app whose route an app built from another app registered first', () => {
    const logger = makeLogger()
    const built = createHttpApp({ logger }, createHttpApp())
    const second = createHttpApp({ logger })
    built.get('/x', () => 'built')
    second.get('/x', () => 'second')

    expect(logger.warn).toHaveBeenCalledOnce()
  })

  it('keeps one app registering a route twice silent, and the handler chain falls through', async () => {
    const logger = makeLogger()
    const app = createHttpApp({ logger })
    app.get('/resource', () => {
      throw new HttpError(401)
    })
    app.get('/resource', () => 'fallback')

    expect(logger.warn).not.toHaveBeenCalled()
    const res = await app.request('/resource')
    expect(res!.status).toBe(200)
    expect(await res!.text()).toBe('fallback')
  })

  it('treats case-only variants as one route under ignoreCase: one warning per app', async () => {
    const secondLogger = makeLogger()
    const thirdLogger = makeLogger()
    // the first app creates the global Wooks, so its router options are the ones that apply
    const router = { ignoreCase: true }
    const first = createHttpApp({ logger: makeLogger(), router })
    const second = createHttpApp({ logger: secondLogger, router })
    const third = createHttpApp({ logger: thirdLogger, router })
    first.get('/Users', () => 'first users')
    first.get('/Items/:id', () => 'first items')
    second.get('/users', () => 'second users')
    second.get('/items/:id', () => 'second items')
    third.get('/ITEMS/:id', () => 'third items')

    expect(secondLogger.warn).toHaveBeenCalledOnce()
    expect(secondLogger.warn.mock.calls[0][0]).toContain('"GET /users" is already registered')
    expect(thirdLogger.warn).toHaveBeenCalledOnce()
    expect(thirdLogger.warn.mock.calls[0][0]).toContain('"GET /ITEMS/:id" is already registered')
    expect(await (await second.request('/USERS'))!.text()).toBe('first users')
    expect(await (await third.request('/items/7'))!.text()).toBe('first items')
  })
})
