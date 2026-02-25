import { describe, it, expect } from 'vitest'
import { cachedBy, key, EventContext, run } from '../index'

const logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
}

describe('cachedBy', () => {
  it('computes and caches per key', () => {
    let calls = 0
    const getDouble = cachedBy((n: number) => {
      calls++
      return n * 2
    })

    const ctx = new EventContext({ logger })
    run(ctx, () => {
      expect(getDouble(5)).toBe(10)
      expect(getDouble(5)).toBe(10) // cache hit
      expect(getDouble(3)).toBe(6) // different key
      expect(calls).toBe(2) // only 2 unique keys computed
    })
  })

  it('caches async results per key', async () => {
    let calls = 0
    const fetchUser = cachedBy(async (id: string) => {
      calls++
      return { id, name: `User ${id}` }
    })

    const ctx = new EventContext({ logger })
    await run(ctx, async () => {
      const u1 = await fetchUser('abc')
      const u2 = await fetchUser('abc') // cache hit
      const u3 = await fetchUser('xyz') // different key

      expect(u1).toEqual({ id: 'abc', name: 'User abc' })
      expect(u1).toBe(u2) // same object
      expect(u3).toEqual({ id: 'xyz', name: 'User xyz' })
      expect(calls).toBe(2)
    })
  })

  it('isolates cache per event context', () => {
    let calls = 0
    const getValue = cachedBy((k: string) => {
      calls++
      return `value-${k}-${calls}`
    })

    const ctx1 = new EventContext({ logger })
    const ctx2 = new EventContext({ logger })

    let r1: string | undefined
    let r2: string | undefined

    run(ctx1, () => {
      r1 = getValue('a')
    })
    run(ctx2, () => {
      r2 = getValue('a')
    })

    expect(r1).toBe('value-a-1')
    expect(r2).toBe('value-a-2') // separate cache
    expect(calls).toBe(2)
  })

  it('receives context as second argument', () => {
    const dbConn = key<string>('db')
    const query = cachedBy((table: string, ctx) => {
      return `SELECT * FROM ${table} USING ${ctx.get(dbConn)}`
    })

    const ctx = new EventContext({ logger })
    ctx.set(dbConn, 'pg://localhost')

    run(ctx, () => {
      expect(query('users')).toBe('SELECT * FROM users USING pg://localhost')
    })
  })

  it('accepts explicit ctx parameter', () => {
    const getDouble = cachedBy((n: number) => n * 2)

    const ctx = new EventContext({ logger })
    // pass ctx explicitly — no ALS needed
    expect(getDouble(7, ctx)).toBe(14)
    expect(getDouble(7, ctx)).toBe(14)
  })
})
