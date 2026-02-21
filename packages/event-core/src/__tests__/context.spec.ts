import { describe, expect, it } from 'vitest'

import { asyncStorage, createAsyncEventContext, useAsyncEventContext } from '../context'
import type { TGenericContextStore } from '../context'

function createTestContext(
  overrides?: Partial<TGenericContextStore>,
): <T>(cb: (...a: any[]) => T) => T {
  return createAsyncEventContext({
    event: { type: 'TEST' },
    options: {},
    ...overrides,
  })
}

describe('createAsyncEventContext', () => {
  it('must run callback within async context', () => {
    const run = createTestContext()
    const result = run(() => {
      const store = asyncStorage.getStore()
      expect(store).toBeDefined()
      return 'ok'
    })
    expect(result).toBe('ok')
  })

  it('must shallow-copy the input data', () => {
    const data = { event: { type: 'TEST' }, options: {} }
    const run = createAsyncEventContext(data)
    run(() => {
      const store = asyncStorage.getStore()!
      expect(store).not.toBe(data)
      expect(store.event.type).toBe('TEST')
    })
  })

  it('must set parentCtx when nested inside another context', () => {
    const outerRun = createTestContext()
    outerRun(() => {
      const outerStore = asyncStorage.getStore()
      const innerRun = createAsyncEventContext({
        event: { type: 'INNER' },
        options: {},
      })
      innerRun(() => {
        const innerStore = asyncStorage.getStore()!
        expect(innerStore.parentCtx).toBe(outerStore)
        expect(innerStore.event.type).toBe('INNER')
      })
    })
  })

  it('must not set parentCtx when there is no outer context', () => {
    const run = createTestContext()
    run(() => {
      const store = asyncStorage.getStore()!
      expect(store.parentCtx).toBeUndefined()
    })
  })

  it('must return the callback return value', () => {
    const run = createTestContext()
    expect(run(() => 42)).toBe(42)
  })

  it('must support async callbacks', async () => {
    const run = createTestContext()
    const result = await run(async () => {
      await new Promise((r) => setTimeout(r, 1))
      return asyncStorage.getStore()?.event.type
    })
    expect(result).toBe('TEST')
  })
})

describe('useAsyncEventContext', () => {
  it('must throw when called outside of a context', () => {
    expect(() => useAsyncEventContext()).toThrowError(
      'Event context does not exist at this point.',
    )
  })

  it('must return context helpers', () => {
    const run = createTestContext()
    run(() => {
      const helpers = useAsyncEventContext()
      expect(helpers.getCtx).toBeTypeOf('function')
      expect(helpers.store).toBeTypeOf('function')
      expect(helpers.getStore).toBeTypeOf('function')
      expect(helpers.setStore).toBeTypeOf('function')
      expect(helpers.hasParentCtx).toBeTypeOf('function')
      expect(helpers.getParentCtx).toBeTypeOf('function')
      expect(helpers.setParentCtx).toBeTypeOf('function')
    })
  })

  it('must validate event type with a string', () => {
    const run = createTestContext()
    run(() => {
      expect(() => useAsyncEventContext('TEST')).not.toThrow()
      expect(() => useAsyncEventContext('OTHER')).toThrowError(
        'Event context type mismatch: expected "OTHER", received "TEST"',
      )
    })
  })

  it('must validate event type with an array', () => {
    const run = createTestContext()
    run(() => {
      expect(() => useAsyncEventContext(['TEST', 'HTTP'])).not.toThrow()
      expect(() => useAsyncEventContext(['HTTP', 'CLI'])).toThrowError(
        'Event context type mismatch: expected "HTTP", "CLI", received "TEST"',
      )
    })
  })

  it('must fall back to parentCtx when type matches parent', () => {
    const outerRun = createAsyncEventContext({
      event: { type: 'HTTP' },
      options: {},
    })
    outerRun(() => {
      const innerRun = createAsyncEventContext({
        event: { type: 'INNER' },
        options: {},
      })
      innerRun(() => {
        const { getCtx } = useAsyncEventContext('HTTP')
        expect(getCtx().event.type).toBe('HTTP')
      })
    })
  })

  it('must throw when type matches neither current nor parent', () => {
    const outerRun = createAsyncEventContext({
      event: { type: 'HTTP' },
      options: {},
    })
    outerRun(() => {
      const innerRun = createAsyncEventContext({
        event: { type: 'INNER' },
        options: {},
      })
      innerRun(() => {
        expect(() => useAsyncEventContext('CLI')).toThrowError(
          'Event context type mismatch',
        )
      })
    })
  })
})

describe('getCtx / getStore / setStore', () => {
  it('must return the full context object', () => {
    const run = createTestContext()
    run(() => {
      const { getCtx } = useAsyncEventContext()
      const ctx = getCtx()
      expect(ctx.event.type).toBe('TEST')
      expect(ctx.options).toEqual({})
    })
  })

  it('must get and set top-level store properties', () => {
    const run = createTestContext()
    run(() => {
      const { getStore, setStore } = useAsyncEventContext()
      expect(getStore('_ended')).toBeUndefined()
      setStore('_ended', true)
      expect(getStore('_ended')).toBe(true)
    })
  })

  it('must get and set routeParams', () => {
    const run = createTestContext()
    run(() => {
      const { setStore, getStore } = useAsyncEventContext()
      setStore('routeParams', { id: '123', tags: ['a', 'b'] })
      expect(getStore('routeParams')).toEqual({ id: '123', tags: ['a', 'b'] })
    })
  })
})

describe('store accessor', () => {
  describe('value', () => {
    it('must read and write store section via .value', () => {
      const run = createTestContext()
      run(() => {
        const { store } = useAsyncEventContext()
        const routeStore = store('routeParams')
        expect(routeStore.value).toBeUndefined()
        routeStore.value = { id: '42' }
        expect(routeStore.value).toEqual({ id: '42' })
      })
    })

    it('must reflect changes across multiple store() calls for the same key', () => {
      const run = createTestContext()
      run(() => {
        const { store } = useAsyncEventContext()
        store('routeParams').value = { key: 'val' }
        expect(store('routeParams').value).toEqual({ key: 'val' })
      })
    })
  })

  describe('set / get', () => {
    it('must set and get nested properties', () => {
      const run = createTestContext()
      run(() => {
        const { store } = useAsyncEventContext()
        const s = store('routeParams')
        s.set('id', '123')
        expect(s.get('id')).toBe('123')
      })
    })

    it('must auto-create parent object if value is undefined', () => {
      const run = createTestContext()
      run(() => {
        const { store } = useAsyncEventContext()
        const s = store('routeParams')
        expect(s.value).toBeUndefined()
        s.set('id', '1')
        expect(s.value).toBeDefined()
        expect(s.get('id')).toBe('1')
      })
    })

    it('must overwrite existing nested properties', () => {
      const run = createTestContext()
      run(() => {
        const { store } = useAsyncEventContext()
        const s = store('routeParams')
        s.set('id', 'old')
        s.set('id', 'new')
        expect(s.get('id')).toBe('new')
      })
    })

    it('must return the set value', () => {
      const run = createTestContext()
      run(() => {
        const { store } = useAsyncEventContext()
        const result = store('routeParams').set('id', '99')
        expect(result).toBe('99')
      })
    })
  })

  describe('has', () => {
    it('must return false for non-existent nested key', () => {
      const run = createTestContext()
      run(() => {
        const { store } = useAsyncEventContext()
        expect(store('routeParams').has('id')).toBe(false)
      })
    })

    it('must return true for existing nested key', () => {
      const run = createTestContext()
      run(() => {
        const { store } = useAsyncEventContext()
        const s = store('routeParams')
        s.set('id', '1')
        expect(s.has('id')).toBe(true)
      })
    })

    it('must return false after del', () => {
      const run = createTestContext()
      run(() => {
        const { store } = useAsyncEventContext()
        const s = store('routeParams')
        s.set('id', '1')
        s.del('id')
        expect(s.has('id')).toBe(false)
      })
    })
  })

  describe('del', () => {
    it('must delete a nested property by setting to undefined', () => {
      const run = createTestContext()
      run(() => {
        const { store } = useAsyncEventContext()
        const s = store('routeParams')
        s.set('id', '1')
        s.del('id')
        expect(s.get('id')).toBeUndefined()
      })
    })

    it('must not throw when deleting non-existent key', () => {
      const run = createTestContext()
      run(() => {
        const { store } = useAsyncEventContext()
        const s = store('routeParams')
        s.set('id', '1')
        expect(() => s.del('nonexistent' as any)).not.toThrow()
      })
    })
  })

  describe('entries', () => {
    it('must return empty array when store section is undefined', () => {
      const run = createTestContext()
      run(() => {
        const { store } = useAsyncEventContext()
        expect(store('routeParams').entries()).toEqual([])
      })
    })

    it('must return all nested key-value pairs', () => {
      const run = createTestContext()
      run(() => {
        const { store } = useAsyncEventContext()
        const s = store('routeParams')
        s.set('id', '1')
        s.set('name', 'test')
        const entries = s.entries()
        expect(entries).toEqual(
          expect.arrayContaining([
            ['id', '1'],
            ['name', 'test'],
          ]),
        )
        expect(entries).toHaveLength(2)
      })
    })
  })

  describe('clear', () => {
    it('must reset store section to empty object', () => {
      const run = createTestContext()
      run(() => {
        const { store } = useAsyncEventContext()
        const s = store('routeParams')
        s.set('id', '1')
        s.set('name', 'test')
        s.clear()
        expect(s.value).toEqual({})
        expect(s.has('id')).toBe(false)
        expect(s.entries()).toEqual([])
      })
    })
  })

  describe('init', () => {
    it('must call getter on first access and cache the result', () => {
      const run = createTestContext()
      run(() => {
        const { store } = useAsyncEventContext()
        const s = store('event')
        let callCount = 0
        const getter = () => {
          callCount++
          return `generated-id-${callCount}`
        }
        const first = s.init('id', getter)
        const second = s.init('id', getter)
        expect(first).toBe('generated-id-1')
        expect(second).toBe('generated-id-1')
        expect(callCount).toBe(1)
      })
    })

    it('must not overwrite a value that was already set', () => {
      const run = createTestContext()
      run(() => {
        const { store } = useAsyncEventContext()
        const s = store('event')
        s.set('id', 'existing')
        const result = s.init('id', () => 'new-value')
        expect(result).toBe('existing')
      })
    })

    it('must set value when key does not exist', () => {
      const run = createTestContext()
      run(() => {
        const { store } = useAsyncEventContext()
        const s = store('event')
        const result = s.init('id', () => 'lazy-value')
        expect(result).toBe('lazy-value')
        expect(s.get('id')).toBe('lazy-value')
      })
    })
  })

  describe('hook', () => {
    it('must create a reactive accessor for a nested property', () => {
      const run = createTestContext()
      run(() => {
        const { store } = useAsyncEventContext()
        const s = store('event')
        const hooked = s.hook('id')
        expect(hooked.value).toBeUndefined()
        hooked.value = 'hooked-id'
        expect(hooked.value).toBe('hooked-id')
        expect(s.get('id')).toBe('hooked-id')
      })
    })

    it('must reflect changes made via set() in hooked accessor', () => {
      const run = createTestContext()
      run(() => {
        const { store } = useAsyncEventContext()
        const s = store('event')
        const hooked = s.hook('id')
        s.set('id', 'set-value')
        expect(hooked.value).toBe('set-value')
      })
    })

    it('must report isDefined correctly', () => {
      const run = createTestContext()
      run(() => {
        const { store } = useAsyncEventContext()
        const s = store('event')
        const hooked = s.hook('id')
        expect(hooked.isDefined).toBe(false)
        hooked.value = 'defined-now'
        expect(hooked.isDefined).toBe(true)
      })
    })

    it('must report isDefined as false after del', () => {
      const run = createTestContext()
      run(() => {
        const { store } = useAsyncEventContext()
        const s = store('event')
        const hooked = s.hook('id')
        hooked.value = 'temp'
        expect(hooked.isDefined).toBe(true)
        s.del('id')
        expect(hooked.isDefined).toBe(false)
      })
    })
  })
})

describe('parent context', () => {
  it('must report hasParentCtx as false at top level', () => {
    const run = createTestContext()
    run(() => {
      const { hasParentCtx } = useAsyncEventContext()
      expect(hasParentCtx()).toBe(false)
    })
  })

  it('must report hasParentCtx as true in nested context', () => {
    const outerRun = createTestContext()
    outerRun(() => {
      const innerRun = createAsyncEventContext({
        event: { type: 'INNER' },
        options: {},
      })
      innerRun(() => {
        const { hasParentCtx } = useAsyncEventContext()
        expect(hasParentCtx()).toBe(true)
      })
    })
  })

  it('must return parent context helpers via getParentCtx', () => {
    const outerRun = createTestContext()
    outerRun(() => {
      const { setStore } = useAsyncEventContext()
      setStore('routeParams', { outer: 'yes' })

      const innerRun = createAsyncEventContext({
        event: { type: 'INNER' },
        options: {},
      })
      innerRun(() => {
        const { getParentCtx } = useAsyncEventContext()
        const parent = getParentCtx()
        expect(parent.getCtx().event.type).toBe('TEST')
        expect(parent.getStore('routeParams')).toEqual({ outer: 'yes' })
      })
    })
  })

  it('must throw when getParentCtx called without parent', () => {
    const run = createTestContext()
    run(() => {
      const { getParentCtx } = useAsyncEventContext()
      expect(() => getParentCtx()).toThrowError('Parent context is not available')
    })
  })

  it('must allow setParentCtx to override parent', () => {
    const run = createTestContext()
    run(() => {
      const { setParentCtx, hasParentCtx, getParentCtx } = useAsyncEventContext()
      expect(hasParentCtx()).toBe(false)
      const fakeParent = { event: { type: 'FAKE' }, options: {} }
      setParentCtx(fakeParent)
      expect(hasParentCtx()).toBe(true)
      expect(getParentCtx().getCtx().event.type).toBe('FAKE')
    })
  })
})

describe('context isolation', () => {
  it('must isolate concurrent contexts', async () => {
    const results: string[] = []

    const p1 = new Promise<void>((resolve) => {
      const run = createAsyncEventContext({
        event: { type: 'CTX1' },
        options: {},
      })
      run(async () => {
        await new Promise((r) => setTimeout(r, 10))
        const { getCtx } = useAsyncEventContext()
        results.push(getCtx().event.type)
        resolve()
      })
    })

    const p2 = new Promise<void>((resolve) => {
      const run = createAsyncEventContext({
        event: { type: 'CTX2' },
        options: {},
      })
      run(async () => {
        await new Promise((r) => setTimeout(r, 5))
        const { getCtx } = useAsyncEventContext()
        results.push(getCtx().event.type)
        resolve()
      })
    })

    await Promise.all([p1, p2])
    expect(results).toContain('CTX1')
    expect(results).toContain('CTX2')
    expect(results).toHaveLength(2)
  })

  it('must not leak context after callback completes', () => {
    const run = createTestContext()
    run(() => {
      expect(asyncStorage.getStore()).toBeDefined()
    })
    expect(asyncStorage.getStore()).toBeUndefined()
  })
})

describe('optimization: store caching', () => {
  it('must return the same store accessor for the same key', () => {
    const run = createTestContext()
    run(() => {
      const { store } = useAsyncEventContext()
      const s1 = store('routeParams')
      const s2 = store('routeParams')
      expect(s1).toBe(s2)
    })
  })

  it('must return the same store accessor across different helpers instances', () => {
    const run = createTestContext()
    run(() => {
      const s1 = useAsyncEventContext().store('routeParams')
      const s2 = useAsyncEventContext().store('routeParams')
      expect(s1).toBe(s2)
    })
  })

  it('must return different store accessors for different keys', () => {
    const run = createTestContext()
    run(() => {
      const { store } = useAsyncEventContext()
      const s1 = store('event')
      const s2 = store('routeParams')
      expect(s1).not.toBe(s2)
    })
  })

  it('must not share store cache between different contexts', () => {
    let s1: any
    let s2: any
    const run1 = createAsyncEventContext({ event: { type: 'A' }, options: {} })
    run1(() => {
      s1 = useAsyncEventContext().store('event')
      s1.set('id', 'ctx-a')
    })
    const run2 = createAsyncEventContext({ event: { type: 'B' }, options: {} })
    run2(() => {
      s2 = useAsyncEventContext().store('event')
      s2.set('id', 'ctx-b')
    })
    expect(s1).not.toBe(s2)
  })

  it('must not leak cached state between concurrent requests', async () => {
    const results: boolean[] = []

    const p1 = new Promise<void>((resolve) => {
      const run = createAsyncEventContext({ event: { type: 'R1' }, options: {} })
      run(async () => {
        const { store } = useAsyncEventContext()
        store('routeParams').set('id', '1')
        await new Promise((r) => setTimeout(r, 5))
        results.push(store('routeParams').get('id') === '1')
        resolve()
      })
    })

    const p2 = new Promise<void>((resolve) => {
      const run = createAsyncEventContext({ event: { type: 'R2' }, options: {} })
      run(async () => {
        const { store } = useAsyncEventContext()
        store('routeParams').set('id', '2')
        await new Promise((r) => setTimeout(r, 10))
        results.push(store('routeParams').get('id') === '2')
        resolve()
      })
    })

    await Promise.all([p1, p2])
    expect(results).toEqual([true, true])
  })
})
