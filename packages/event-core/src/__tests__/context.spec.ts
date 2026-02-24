import { describe, it, expect } from 'vitest';
import { key, cached, EventContext } from '../index';

const logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
};

describe('EventContext', () => {
  describe('key get/set', () => {
    it('stores and retrieves a value by key', () => {
      const name = key<string>('name');
      const ctx = new EventContext({ logger });
      ctx.set(name, 'alice');
      expect(ctx.get(name)).toBe('alice');
    });

    it('throws when getting a key that was never set', () => {
      const missing = key<string>('missing');
      const ctx = new EventContext({ logger });
      expect(() => ctx.get(missing)).toThrow('Key "missing" is not set');
    });

    it('supports null and falsy values', () => {
      const n = key<number>('num');
      const s = key<string>('str');
      const b = key<boolean>('bool');
      const nl = key<null>('nil');

      const ctx = new EventContext({ logger });
      ctx.set(n, 0);
      ctx.set(s, '');
      ctx.set(b, false);
      ctx.set(nl, null);

      expect(ctx.get(n)).toBe(0);
      expect(ctx.get(s)).toBe('');
      expect(ctx.get(b)).toBe(false);
      expect(ctx.get(nl)).toBe(null);
    });

    it('overwrites a previously set key', () => {
      const val = key<string>('val');
      const ctx = new EventContext({ logger });
      ctx.set(val, 'first');
      ctx.set(val, 'second');
      expect(ctx.get(val)).toBe('second');
    });
  });

  describe('has', () => {
    it('returns false for unset keys', () => {
      const k = key<string>('k');
      const ctx = new EventContext({ logger });
      expect(ctx.has(k)).toBe(false);
    });

    it('returns true for set keys', () => {
      const k = key<string>('k');
      const ctx = new EventContext({ logger });
      ctx.set(k, 'val');
      expect(ctx.has(k)).toBe(true);
    });
  });

  describe('cached', () => {
    it('evaluates lazily on first get', () => {
      let calls = 0;
      const val = cached((ctx) => {
        calls++;
        return 42;
      });
      const ctx = new EventContext({ logger });
      expect(calls).toBe(0);
      expect(ctx.get(val)).toBe(42);
      expect(calls).toBe(1);
    });

    it('caches the result — second get does not recompute', () => {
      let calls = 0;
      const val = cached(() => {
        calls++;
        return 'computed';
      });
      const ctx = new EventContext({ logger });
      ctx.get(val);
      ctx.get(val);
      ctx.get(val);
      expect(calls).toBe(1);
    });

    it('can depend on keys', () => {
      const firstName = key<string>('first');
      const lastName = key<string>('last');
      const fullName = cached((ctx) => `${ctx.get(firstName)} ${ctx.get(lastName)}`);

      const ctx = new EventContext({ logger });
      ctx.set(firstName, 'John');
      ctx.set(lastName, 'Doe');
      expect(ctx.get(fullName)).toBe('John Doe');
    });

    it('can depend on other cached values', () => {
      const base = key<number>('base');
      const doubled = cached((ctx) => ctx.get(base) * 2);
      const quadrupled = cached((ctx) => ctx.get(doubled) * 2);

      const ctx = new EventContext({ logger });
      ctx.set(base, 5);
      expect(ctx.get(quadrupled)).toBe(20);
    });

    it('caches async results (promises)', async () => {
      let calls = 0;
      const asyncVal = cached(async () => {
        calls++;
        return 'async-result';
      });

      const ctx = new EventContext({ logger });
      const p1 = ctx.get(asyncVal);
      const p2 = ctx.get(asyncVal);
      expect(p1).toBe(p2); // same promise instance
      expect(await p1).toBe('async-result');
      expect(calls).toBe(1);
    });

    it('detects circular dependencies', () => {
      const a: ReturnType<typeof cached<number>> = cached((ctx) => ctx.get(b));
      const b: ReturnType<typeof cached<number>> = cached((ctx) => ctx.get(a));

      const ctx = new EventContext({ logger });
      expect(() => ctx.get(a)).toThrow(/[Cc]ircular/);
    });

    it('caches errors — subsequent gets re-throw the same error', () => {
      let calls = 0;
      const failing = cached(() => {
        calls++;
        throw new Error('boom');
      });

      const ctx = new EventContext({ logger });
      expect(() => ctx.get(failing)).toThrow('boom');
      expect(() => ctx.get(failing)).toThrow('boom');
      expect(calls).toBe(1);
    });
  });

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
})
