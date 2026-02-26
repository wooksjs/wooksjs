import { afterEach, describe, it, expect, vi } from 'vitest'
import {
  ContextInjector,
  replaceContextInjector,
  resetContextInjector,
  createEventContext,
  slot,
  defineEventKind,
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
