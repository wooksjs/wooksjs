import { describe, expect, it } from 'vitest'

import {
  ContextInjector,
  getContextInjector,
  replaceContextInjector,
} from '../context-injector'

describe('ContextInjector', () => {
  it('must execute callback and return its result with attributes', () => {
    const ci = new ContextInjector()
    const result = ci.with('Event:start', { eventType: 'TEST' }, () => 42)
    expect(result).toBe(42)
  })

  it('must execute callback and return its result without attributes', () => {
    const ci = new ContextInjector()
    const result = ci.with('Event:start', () => 'hello')
    expect(result).toBe('hello')
  })

  it('must have a no-op hook method', () => {
    const ci = new ContextInjector()
    expect(() => ci.hook('GET', 'Handler:not_found')).not.toThrow()
    expect(() => ci.hook('POST', 'Handler:routed', '/api/test')).not.toThrow()
  })
})

describe('getContextInjector / replaceContextInjector', () => {
  it('must return a default ContextInjector instance', () => {
    const ci = getContextInjector()
    expect(ci).toBeInstanceOf(ContextInjector)
  })

  it('must replace the global injector', () => {
    const original = getContextInjector()
    const custom = new ContextInjector()
    replaceContextInjector(custom)
    expect(getContextInjector()).toBe(custom)

    // restore for other tests
    replaceContextInjector(original as ContextInjector<string>)
  })
})
