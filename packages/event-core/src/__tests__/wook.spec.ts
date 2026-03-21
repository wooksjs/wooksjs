import { describe, it, expect } from 'vitest'
import { defineWook, slot, defineEventKind, cached, EventContext, run } from '../index'

import { IsolatedContext } from './test-helpers'

const logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
}

describe('defineWook', () => {
  const http = defineEventKind('http', {
    method: slot<string>(),
    path: slot<string>(),
  })

  const useRequest = defineWook((ctx) => ({
    method: ctx.get(http.keys.method),
    path: ctx.get(http.keys.path),
  }))

  it('returns wook data from the current context', () => {
    const ctx = new EventContext({ logger })
    ctx.seed(http, { method: 'GET', path: '/api' })

    run(ctx, () => {
      const { method, path } = useRequest()
      expect(method).toBe('GET')
      expect(path).toBe('/api')
    })
  })

  it('caches the wook object per context', () => {
    const ctx = new EventContext({ logger })
    ctx.seed(http, { method: 'GET', path: '/' })

    run(ctx, () => {
      const first = useRequest()
      const second = useRequest()
      expect(first).toBe(second) // same object reference
    })
  })

  it('different contexts get different wook instances', () => {
    const ctx1 = new EventContext({ logger })
    ctx1.seed(http, { method: 'GET', path: '/a' })

    const ctx2 = new EventContext({ logger })
    ctx2.seed(http, { method: 'POST', path: '/b' })

    let wook1: unknown
    let wook2: unknown

    run(ctx1, () => {
      wook1 = useRequest()
    })
    run(ctx2, () => {
      wook2 = useRequest()
    })

    expect(wook1).not.toBe(wook2)
    expect((wook1 as any).method).toBe('GET')
    expect((wook2 as any).method).toBe('POST')
  })

  it('throws when called outside a context', () => {
    expect(() => useRequest()).toThrow('No active event context')
  })

  it('wook with lazy cached values', async () => {
    let parseCalls = 0
    const rawBody = cached(async () => Buffer.from('{"ok":true}'))
    const parsedBody = cached(async (ctx) => {
      parseCalls++
      const buf = await ctx.get(rawBody)
      return JSON.parse(buf.toString())
    })

    const useBody = defineWook((ctx) => ({
      parseBody: () => ctx.get(parsedBody),
    }))

    const ctx = new EventContext({ logger })

    await run(ctx, async () => {
      const { parseBody } = useBody()
      const body1 = await parseBody()
      const body2 = await parseBody()
      expect(body1).toEqual({ ok: true })
      expect(body1).toBe(body2) // same cached object
      expect(parseCalls).toBe(1)
    })
  })

  it('exposes _slot as a Cached accessor', () => {
    const useFoo = defineWook(() => ({ value: 42 }))
    expect(useFoo._slot).toBeDefined()
    expect(typeof useFoo._slot._id).toBe('number')
    expect(typeof useFoo._slot._fn).toBe('function')
  })

  it('_slot can be used to isolate a wook in a child context', () => {
    let factoryCalls = 0
    const useReq = defineWook((ctx) => {
      factoryCalls++
      return {
        method: ctx.get(http.keys.method),
        path: ctx.get(http.keys.path),
      }
    })

    const parent = new EventContext({ logger })
    parent.seed(http, { method: 'GET', path: '/parent' })
    run(parent, () => {
      const req = useReq()
      expect(req.method).toBe('GET')
      expect(req.path).toBe('/parent')
    })
    expect(factoryCalls).toBe(1)

    // Child isolates the wook's slot so it re-computes with child's keys
    const child = new IsolatedContext({ logger, parent }, [useReq._slot])
    child.setOwn(http.keys.method, 'POST')
    child.setOwn(http.keys.path, '/child')

    run(child, () => {
      const req = useReq()
      expect(req.method).toBe('POST')
      expect(req.path).toBe('/child')
    })
    expect(factoryCalls).toBe(2)
  })
})
