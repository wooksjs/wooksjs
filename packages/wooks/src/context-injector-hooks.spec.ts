import { afterEach, describe, it, expect, vi } from 'vitest'
import {
  ContextInjector,
  replaceContextInjector,
  resetContextInjector,
  createEventContext,
  current,
  slot,
  defineEventKind,
  useRouteParams,
} from '@wooksjs/event-core'
import type { Logger } from '@wooksjs/event-core'

import { Wooks } from './wooks'

const logger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
}

const http = defineEventKind('HTTP', {
  method: slot<string>(),
})

function installHookSpy() {
  const hookSpy = vi.fn<[string, string, string?]>()
  const injector = new ContextInjector()
  injector.hook = hookSpy
  replaceContextInjector(injector as ContextInjector<string>)
  return hookSpy
}

afterEach(() => {
  resetContextInjector()
})

describe('hook() via Wooks router', () => {
  it('fires Handler:routed with method and route path', () => {
    const hookSpy = installHookSpy()
    const wooks = new Wooks()
    wooks.on('GET', '/users/:id', () => 'ok')

    createEventContext({ logger }, http, { method: 'GET' }, () => {
      wooks.lookupHandlers('GET', '/users/42')
    })

    expect(hookSpy).toHaveBeenCalledOnce()
    expect(hookSpy).toHaveBeenCalledWith('GET', 'Handler:routed', '/users/:id')
  })

  it('fires Handler:not_found when route does not match', () => {
    const hookSpy = installHookSpy()
    const wooks = new Wooks()

    createEventContext({ logger }, http, { method: 'GET' }, () => {
      wooks.lookupHandlers('GET', '/nonexistent')
    })

    expect(hookSpy).toHaveBeenCalledOnce()
    expect(hookSpy).toHaveBeenCalledWith('GET', 'Handler:not_found')
  })

  it('fires hook via lookup() as well', () => {
    const hookSpy = installHookSpy()
    const wooks = new Wooks()
    wooks.on('POST', '/api/data', () => 'ok')

    createEventContext({ logger }, http, { method: 'POST' }, () => {
      wooks.lookup('POST', '/api/data')
    })

    expect(hookSpy).toHaveBeenCalledOnce()
    expect(hookSpy).toHaveBeenCalledWith('POST', 'Handler:routed', '/api/data')
  })

  it('does not throw when no injector is installed', () => {
    // resetContextInjector already called in afterEach — injector is null
    const wooks = new Wooks()
    wooks.on('GET', '/test', () => 'ok')

    createEventContext({ logger }, http, { method: 'GET' }, () => {
      const handlers = wooks.lookupHandlers('GET', '/test')
      expect(handlers).toHaveLength(1)
    })
  })

  it('fires hook for each lookup call', () => {
    const hookSpy = installHookSpy()
    const wooks = new Wooks()
    wooks.on('GET', '/a', () => 'a')
    wooks.on('GET', '/b', () => 'b')

    createEventContext({ logger }, http, { method: 'GET' }, () => {
      wooks.lookupHandlers('GET', '/a')
      wooks.lookupHandlers('GET', '/b')
      wooks.lookupHandlers('GET', '/missing')
    })

    expect(hookSpy).toHaveBeenCalledTimes(3)
    expect(hookSpy).toHaveBeenNthCalledWith(1, 'GET', 'Handler:routed', '/a')
    expect(hookSpy).toHaveBeenNthCalledWith(2, 'GET', 'Handler:routed', '/b')
    expect(hookSpy).toHaveBeenNthCalledWith(3, 'GET', 'Handler:not_found')
  })
})

describe('matchRoute() / applyRoute()', () => {
  it('matchRoute() needs no event context and fires no hooks', () => {
    const hookSpy = installHookSpy()
    const wooks = new Wooks()
    wooks.on('GET', '/users/:id', () => 'ok')

    const match = wooks.matchRoute('GET', '/users/42')
    expect(match?.route.path).toBe('/users/:id')
    expect(match?.ctx.params).toEqual({ id: '42' })
    expect(wooks.matchRoute('GET', '/missing')).toBeNull()
    expect(wooks.matchRoute('POST', '/users/42')).toBeNull()
    expect(hookSpy).not.toHaveBeenCalled()
  })

  it('applyRoute() seeds route params and fires Handler:routed in the context', () => {
    const hookSpy = installHookSpy()
    const wooks = new Wooks()
    const handler = vi.fn(() => 'ok')
    wooks.on('GET', '/users/:id', handler)
    const match = wooks.matchRoute('GET', '/users/42')!

    createEventContext({ logger }, http, { method: 'GET' }, () => {
      expect(wooks.applyRoute('GET', match, current())).toEqual([handler])
      expect(useRouteParams().params).toEqual({ id: '42' })
    })

    expect(hookSpy).toHaveBeenCalledOnce()
    expect(hookSpy).toHaveBeenCalledWith('GET', 'Handler:routed', '/users/:id')
  })

  it('applyRoute(null) seeds empty params and fires Handler:not_found', () => {
    const hookSpy = installHookSpy()
    const wooks = new Wooks()

    createEventContext({ logger }, http, { method: 'GET' }, () => {
      expect(wooks.applyRoute('GET', null)).toBeNull()
      expect(useRouteParams().params).toEqual({})
    })

    expect(hookSpy).toHaveBeenCalledWith('GET', 'Handler:not_found')
  })
})
