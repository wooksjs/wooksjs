import { describe, expect, it } from 'vitest'

import { attachHook } from '../hook'

describe('attachHook', () => {
  it('must define a getter on "value" by default', () => {
    const obj = { value: null as string | null }
    attachHook(obj, { get: () => 'hooked' })
    expect(obj.value).toBe('hooked')
  })

  it('must define a setter on "value" by default', () => {
    let stored = ''
    const obj = { value: null as string | null }
    attachHook(obj, {
      get: () => stored,
      set: (v) => { stored = v as string },
    })
    obj.value = 'new-val'
    expect(stored).toBe('new-val')
    expect(obj.value).toBe('new-val')
  })

  it('must define hook on a custom-named property', () => {
    const obj = { count: 0 }
    attachHook(obj, { get: () => 42 }, 'count')
    expect(obj.count).toBe(42)
  })

  it('must return the target object', () => {
    const obj = { value: null }
    const result = attachHook(obj, { get: () => 'x' })
    expect(result).toBe(obj)
  })

  it('must throw on assignment when no setter is defined', () => {
    const obj = { value: null as string | null }
    attachHook(obj, { get: () => 'read-only' })
    expect(obj.value).toBe('read-only')
    // strict mode (ESM) throws on setter-less property assignment
    expect(() => { obj.value = 'attempt' }).toThrow()
  })

  it('must allow dynamic getter values', () => {
    let counter = 0
    const obj = { value: 0 }
    attachHook(obj, { get: () => ++counter })
    expect(obj.value).toBe(1)
    expect(obj.value).toBe(2)
    expect(obj.value).toBe(3)
  })
})
