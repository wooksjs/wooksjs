import { describe, it, expect } from 'vitest'
import { key, cached, EventContext } from '../index'

import { IsolatedContext } from './test-helpers'

const logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
}

describe('EventContext', () => {
  describe('key get/set', () => {
    it('stores and retrieves a value by key', () => {
      const name = key<string>('name')
      const ctx = new EventContext({ logger })
      ctx.set(name, 'alice')
      expect(ctx.get(name)).toBe('alice')
    })

    it('throws when getting a key that was never set', () => {
      const missing = key<string>('missing')
      const ctx = new EventContext({ logger })
      expect(() => ctx.get(missing)).toThrow('Key "missing" is not set')
    })

    it('supports null and falsy values', () => {
      const n = key<number>('num')
      const s = key<string>('str')
      const b = key<boolean>('bool')
      const nl = key<null>('nil')

      const ctx = new EventContext({ logger })
      ctx.set(n, 0)
      ctx.set(s, '')
      ctx.set(b, false)
      ctx.set(nl, null)

      expect(ctx.get(n)).toBe(0)
      expect(ctx.get(s)).toBe('')
      expect(ctx.get(b)).toBe(false)
      expect(ctx.get(nl)).toBe(null)
    })

    it('overwrites a previously set key', () => {
      const val = key<string>('val')
      const ctx = new EventContext({ logger })
      ctx.set(val, 'first')
      ctx.set(val, 'second')
      expect(ctx.get(val)).toBe('second')
    })
  })

  describe('has', () => {
    it('returns false for unset keys', () => {
      const k = key<string>('k')
      const ctx = new EventContext({ logger })
      expect(ctx.has(k)).toBe(false)
    })

    it('returns true for set keys', () => {
      const k = key<string>('k')
      const ctx = new EventContext({ logger })
      ctx.set(k, 'val')
      expect(ctx.has(k)).toBe(true)
    })
  })

  describe('cached', () => {
    it('evaluates lazily on first get', () => {
      let calls = 0
      const val = cached((ctx) => {
        calls++
        return 42
      })
      const ctx = new EventContext({ logger })
      expect(calls).toBe(0)
      expect(ctx.get(val)).toBe(42)
      expect(calls).toBe(1)
    })

    it('caches the result — second get does not recompute', () => {
      let calls = 0
      const val = cached(() => {
        calls++
        return 'computed'
      })
      const ctx = new EventContext({ logger })
      ctx.get(val)
      ctx.get(val)
      ctx.get(val)
      expect(calls).toBe(1)
    })

    it('can depend on keys', () => {
      const firstName = key<string>('first')
      const lastName = key<string>('last')
      const fullName = cached((ctx) => `${ctx.get(firstName)} ${ctx.get(lastName)}`)

      const ctx = new EventContext({ logger })
      ctx.set(firstName, 'John')
      ctx.set(lastName, 'Doe')
      expect(ctx.get(fullName)).toBe('John Doe')
    })

    it('can depend on other cached values', () => {
      const base = key<number>('base')
      const doubled = cached((ctx) => ctx.get(base) * 2)
      const quadrupled = cached((ctx) => ctx.get(doubled) * 2)

      const ctx = new EventContext({ logger })
      ctx.set(base, 5)
      expect(ctx.get(quadrupled)).toBe(20)
    })

    it('caches async results (promises)', async () => {
      let calls = 0
      const asyncVal = cached(async () => {
        calls++
        return 'async-result'
      })

      const ctx = new EventContext({ logger })
      const p1 = ctx.get(asyncVal)
      const p2 = ctx.get(asyncVal)
      expect(p1).toBe(p2) // same promise instance
      expect(await p1).toBe('async-result')
      expect(calls).toBe(1)
    })

    it('detects circular dependencies', () => {
      const a: ReturnType<typeof cached<number>> = cached((ctx) => ctx.get(b))
      const b: ReturnType<typeof cached<number>> = cached((ctx) => ctx.get(a))

      const ctx = new EventContext({ logger })
      expect(() => ctx.get(a)).toThrow(/[Cc]ircular/)
    })

    it('caches errors — subsequent gets re-throw the same error', () => {
      let calls = 0
      const failing = cached(() => {
        calls++
        throw new Error('boom')
      })

      const ctx = new EventContext({ logger })
      expect(() => ctx.get(failing)).toThrow('boom')
      expect(() => ctx.get(failing)).toThrow('boom')
      expect(calls).toBe(1)
    })
  })

  describe('undefined value handling', () => {
    it('stores and retrieves undefined via set/get', () => {
      const val = key<string | undefined>('maybeUndefined')
      const ctx = new EventContext({ logger })
      ctx.set(val, undefined)
      expect(ctx.get(val)).toBeUndefined()
    })

    it('has() returns true after setting undefined', () => {
      const val = key<string | undefined>('maybeUndefined')
      const ctx = new EventContext({ logger })
      expect(ctx.has(val)).toBe(false)
      ctx.set(val, undefined)
      expect(ctx.has(val)).toBe(true)
    })

    it('caches undefined from cached() and returns it correctly', () => {
      let calls = 0
      const val = cached<string | undefined>(() => {
        calls++
        return undefined
      })
      const ctx = new EventContext({ logger })
      expect(ctx.get(val)).toBeUndefined()
      expect(ctx.get(val)).toBeUndefined()
      expect(calls).toBe(1)
    })

    it('has() returns true for cached values that returned undefined', () => {
      const val = cached<string | undefined>(() => undefined)
      const ctx = new EventContext({ logger })
      expect(ctx.has(val)).toBe(false)
      ctx.get(val) // trigger computation
      expect(ctx.has(val)).toBe(true)
    })
  })

  describe('logger', () => {
    it('exposes the logger passed at construction', () => {
      const ctx = new EventContext({ logger })
      expect(ctx.logger).toBe(logger)
    })
  })

  describe('parent chain', () => {
    describe('get() traversal', () => {
      it('reads a key from the parent when not set locally', () => {
        const k = key<string>('k')
        const parent = new EventContext({ logger })
        parent.set(k, 'from-parent')

        const child = new EventContext({ logger, parent })
        expect(child.get(k)).toBe('from-parent')
      })

      it('local value shadows parent value', () => {
        const k = key<string>('k')
        const parent = new EventContext({ logger })
        parent.set(k, 'parent-val')

        const child = new EventContext({ logger, parent })
        child.setOwn(k, 'child-val')
        expect(child.get(k)).toBe('child-val')
      })

      it('traverses multiple levels (grandparent)', () => {
        const k = key<string>('k')
        const grandparent = new EventContext({ logger })
        grandparent.set(k, 'gp-val')

        const parent = new EventContext({ logger, parent: grandparent })
        const child = new EventContext({ logger, parent })
        expect(child.get(k)).toBe('gp-val')
      })

      it('returns cached value from parent without re-computing', () => {
        let calls = 0
        const c = cached(() => {
          calls++
          return 'computed'
        })

        const parent = new EventContext({ logger })
        parent.get(c) // compute in parent
        expect(calls).toBe(1)

        const child = new EventContext({ logger, parent })
        expect(child.get(c)).toBe('computed')
        expect(calls).toBe(1) // no re-computation
      })

      it('computes cached locally when not found in parent', () => {
        let calls = 0
        const c = cached(() => {
          calls++
          return 'fresh'
        })

        const parent = new EventContext({ logger })
        // parent never computes c

        const child = new EventContext({ logger, parent })
        expect(child.get(c)).toBe('fresh')
        expect(calls).toBe(1)
        // cached locally in child
        expect(child.hasOwn(c)).toBe(true)
        expect(parent.hasOwn(c)).toBe(false)
      })

      it('cached factory in child can read keys from parent', () => {
        const name = key<string>('name')
        const greeting = cached((ctx) => `hello ${ctx.get(name)}`)

        const parent = new EventContext({ logger })
        parent.set(name, 'world')

        const child = new EventContext({ logger, parent })
        expect(child.get(greeting)).toBe('hello world')
      })

      it('throws when key is not set in any context', () => {
        const k = key<string>('missing')
        const parent = new EventContext({ logger })
        const child = new EventContext({ logger, parent })
        expect(() => child.get(k)).toThrow('Key "missing" is not set')
      })
    })

    describe('set() routing', () => {
      it('writes to parent when value exists there', () => {
        const k = key<string>('k')
        const parent = new EventContext({ logger })
        parent.set(k, 'original')

        const child = new EventContext({ logger, parent })
        child.set(k, 'updated')

        // written to parent, not child
        expect(parent.get(k)).toBe('updated')
        expect(child.hasOwn(k)).toBe(false)
      })

      it('writes locally for new keys', () => {
        const k = key<string>('k')
        const parent = new EventContext({ logger })
        const child = new EventContext({ logger, parent })

        child.set(k, 'new-val')
        expect(child.getOwn(k)).toBe('new-val')
        expect(parent.hasOwn(k)).toBe(false)
      })

      it('routes to grandparent when value exists there', () => {
        const k = key<string>('k')
        const grandparent = new EventContext({ logger })
        grandparent.set(k, 'gp')

        const parent = new EventContext({ logger, parent: grandparent })
        const child = new EventContext({ logger, parent })

        child.set(k, 'updated')
        expect(grandparent.get(k)).toBe('updated')
        expect(parent.hasOwn(k)).toBe(false)
        expect(child.hasOwn(k)).toBe(false)
      })

      it('writes to nearest parent that has the slot', () => {
        const k = key<string>('k')
        const grandparent = new EventContext({ logger })
        grandparent.set(k, 'gp')

        const parent = new EventContext({ logger, parent: grandparent })
        parent.setOwn(k, 'parent')

        const child = new EventContext({ logger, parent })
        child.set(k, 'updated')

        // parent is nearest with slot — written there
        expect(parent.getOwn(k)).toBe('updated')
        expect(grandparent.getOwn(k)).toBe('gp') // unchanged
      })
    })

    describe('has() traversal', () => {
      it('returns true when key exists in parent', () => {
        const k = key<string>('k')
        const parent = new EventContext({ logger })
        parent.set(k, 'val')

        const child = new EventContext({ logger, parent })
        expect(child.has(k)).toBe(true)
      })

      it('returns false when key exists nowhere in chain', () => {
        const k = key<string>('k')
        const parent = new EventContext({ logger })
        const child = new EventContext({ logger, parent })
        expect(child.has(k)).toBe(false)
      })
    })

    describe('getOwn / setOwn / hasOwn (local-only)', () => {
      it('getOwn ignores parent', () => {
        const k = key<string>('k')
        const parent = new EventContext({ logger })
        parent.set(k, 'parent-val')

        const child = new EventContext({ logger, parent })
        expect(() => child.getOwn(k)).toThrow('Key "k" is not set')
      })

      it('setOwn always writes locally', () => {
        const k = key<string>('k')
        const parent = new EventContext({ logger })
        parent.set(k, 'parent-val')

        const child = new EventContext({ logger, parent })
        child.setOwn(k, 'local')

        expect(child.getOwn(k)).toBe('local')
        expect(parent.get(k)).toBe('parent-val') // unchanged
      })

      it('hasOwn ignores parent', () => {
        const k = key<string>('k')
        const parent = new EventContext({ logger })
        parent.set(k, 'val')

        const child = new EventContext({ logger, parent })
        expect(child.hasOwn(k)).toBe(false)
        expect(child.has(k)).toBe(true) // chain-aware
      })
    })

    describe('parent property', () => {
      it('exposes the parent context', () => {
        const parent = new EventContext({ logger })
        const child = new EventContext({ logger, parent })
        expect(child.parent).toBe(parent)
      })

      it('is undefined for root contexts', () => {
        const ctx = new EventContext({ logger })
        expect(ctx.parent).toBeUndefined()
      })
    })
  })

  describe('_shouldTraverseParent isolation', () => {
    it('get() re-computes isolated cached slot instead of inheriting', () => {
      let calls = 0
      const c = cached(() => {
        calls++
        return `result-${calls}`
      })

      const parent = new EventContext({ logger })
      parent.get(c)
      expect(calls).toBe(1)

      const child = new IsolatedContext({ logger, parent }, [c])
      const val = child.get(c)
      expect(calls).toBe(2)
      expect(val).toBe('result-2')
    })

    it('get() still inherits non-isolated slots from parent', () => {
      let calls = 0
      const c = cached(() => {
        calls++
        return 'computed'
      })

      const parent = new EventContext({ logger })
      parent.get(c)
      expect(calls).toBe(1)

      const child = new IsolatedContext({ logger, parent }, [])
      expect(child.get(c)).toBe('computed')
      expect(calls).toBe(1)
    })

    it('has() returns false for isolated slot even when parent has it', () => {
      const k = key<string>('k')
      const parent = new EventContext({ logger })
      parent.set(k, 'val')

      const child = new IsolatedContext({ logger, parent }, [k])
      expect(child.has(k)).toBe(false)
      expect(child.hasOwn(k)).toBe(false)
    })

    it('set() writes locally for isolated slot instead of to parent', () => {
      const k = key<string>('k')
      const parent = new EventContext({ logger })
      parent.set(k, 'original')

      const child = new IsolatedContext({ logger, parent }, [k])
      child.set(k, 'child-val')

      expect(child.getOwn(k)).toBe('child-val')
      expect(parent.get(k)).toBe('original')
    })

    it('isolated cached factory reads child local keys when both are isolated', () => {
      const name = key<string>('name')
      const greeting = cached((ctx) => `hello ${ctx.get(name)}`)

      const parent = new EventContext({ logger })
      parent.set(name, 'parent-world')
      parent.get(greeting)

      // Isolate greeting but NOT name — name still inherited from parent
      const child1 = new IsolatedContext({ logger, parent }, [greeting])
      expect(child1.get(greeting)).toBe('hello parent-world')

      // Isolate both — child sets name locally
      const child2 = new IsolatedContext({ logger, parent }, [greeting, name])
      child2.setOwn(name, 'child-world')
      expect(child2.get(greeting)).toBe('hello child-world')
    })

    it('mixed isolation: some slots isolated, others inherited', () => {
      const a = key<string>('a')
      const b = key<string>('b')
      let cCalls = 0
      const c = cached(() => {
        cCalls++
        return 'computed-c'
      })

      const parent = new EventContext({ logger })
      parent.set(a, 'parent-a')
      parent.set(b, 'parent-b')
      parent.get(c)

      const child = new IsolatedContext({ logger, parent }, [a, c])

      // b inherits from parent
      expect(child.get(b)).toBe('parent-b')
      expect(child.has(b)).toBe(true)

      // a is isolated — not visible from parent
      expect(child.has(a)).toBe(false)
      expect(() => child.get(a)).toThrow('Key "a" is not set')

      // c is isolated — re-computes
      expect(cCalls).toBe(1)
      expect(child.get(c)).toBe('computed-c')
      expect(cCalls).toBe(2)

      // set on isolated a writes locally, not to parent
      child.set(a, 'child-a')
      expect(child.getOwn(a)).toBe('child-a')
      expect(parent.get(a)).toBe('parent-a')
    })
  })
})
