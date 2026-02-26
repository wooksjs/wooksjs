import { describe, it, expect, vi } from 'vitest'
import {
  ContextInjector,
  getContextInjector,
  replaceContextInjector,
  resetContextInjector,
  createEventContext,
  current,
  slot,
  defineEventKind,
  eventTypeKey,
} from '../index'
import type { Logger } from '../index'

const logger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
}

describe('ContextInjector', () => {
  it('executes callback and returns result with attributes', () => {
    const ci = new ContextInjector()
    const result = ci.with('Event:start', { eventType: 'TEST' }, () => 42)
    expect(result).toBe(42)
  })

  it('executes callback and returns result without attributes', () => {
    const ci = new ContextInjector()
    const result = ci.with('Event:start', () => 'hello')
    expect(result).toBe('hello')
  })

  it('has a no-op hook method', () => {
    const ci = new ContextInjector()
    expect(() => ci.hook('GET', 'Handler:not_found')).not.toThrow()
    expect(() => ci.hook('POST', 'Handler:routed', '/api/test')).not.toThrow()
  })
})

describe('getContextInjector / replaceContextInjector', () => {
  it('returns null when no injector has been installed', () => {
    const ci = getContextInjector()
    expect(ci).toBeNull()
  })

  it('replaces the global injector', () => {
    const custom = new ContextInjector()
    replaceContextInjector(custom)
    expect(getContextInjector()).toBe(custom)

    // restore for other tests
    resetContextInjector()
  })
})

describe('ContextInjector integration with createEventContext', () => {
  it('calls CI with Event:start when kind is provided', () => {
    const withSpy = vi.fn((_name: unknown, _attrs: unknown, cb: () => unknown) => cb())
    const custom = new ContextInjector()
    custom.with = withSpy as typeof custom.with
    replaceContextInjector(custom as ContextInjector<string>)

    const http = defineEventKind('HTTP', {
      method: slot<string>(),
    })

    createEventContext({ logger }, http, { method: 'GET' }, () => {
      expect(current().get(http.keys.method)).toBe('GET')
    })

    expect(withSpy).toHaveBeenCalledOnce()
    expect(withSpy.mock.calls[0][0]).toBe('Event:start')
    expect(withSpy.mock.calls[0][1]).toEqual({ eventType: 'HTTP' })

    resetContextInjector()
  })

  it('does NOT call CI when no kind is provided', () => {
    const withSpy = vi.fn((_name: unknown, _attrs: unknown, cb: () => unknown) => cb())
    const custom = new ContextInjector()
    custom.with = withSpy as typeof custom.with
    replaceContextInjector(custom as ContextInjector<string>)

    createEventContext({ logger }, () => {
      // bare context, no kind
    })

    expect(withSpy).not.toHaveBeenCalled()

    resetContextInjector()
  })

  it('auto-sets eventTypeKey when kind is provided', () => {
    const http = defineEventKind('HTTP', {
      method: slot<string>(),
    })

    createEventContext({ logger }, http, { method: 'GET' }, () => {
      expect(current().get(eventTypeKey)).toBe('HTTP')
    })
  })

  it('does not set eventTypeKey for bare context', () => {
    createEventContext({ logger }, () => {
      expect(current().has(eventTypeKey)).toBe(false)
    })
  })
})

describe('seed() does not trigger CI (optimized hot path)', () => {
  it('does NOT call CI when seeding with callback', () => {
    const withSpy = vi.fn()
    const custom = new ContextInjector()
    custom.with = withSpy as typeof custom.with
    replaceContextInjector(custom as ContextInjector<string>)

    const wf = defineEventKind('WF', {
      triggerId: slot<string>(),
    })

    createEventContext({ logger }, () => {
      withSpy.mockClear()

      current().seed(wf, { triggerId: 'wf-001' }, () => {
        expect(current().get(wf.keys.triggerId)).toBe('wf-001')
        expect(current().get(eventTypeKey)).toBe('WF')
      })

      expect(withSpy).not.toHaveBeenCalled()
    })

    resetContextInjector()
  })

  it('does NOT call CI when seeding without callback', () => {
    const withSpy = vi.fn()
    const custom = new ContextInjector()
    custom.with = withSpy as typeof custom.with
    replaceContextInjector(custom as ContextInjector<string>)

    const wf = defineEventKind('WF', {
      triggerId: slot<string>(),
    })

    createEventContext({ logger }, () => {
      withSpy.mockClear()
      current().seed(wf, { triggerId: 'wf-001' })
      expect(withSpy).not.toHaveBeenCalled()
      expect(current().get(wf.keys.triggerId)).toBe('wf-001')
    })

    resetContextInjector()
  })
})
