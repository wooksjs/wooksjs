import { current } from '@wooksjs/event-core'
import { describe, expect, it } from 'vitest'

import { httpKind } from '../../http-kind'
import { prepareTestHttpContext } from '../../testing'
import { DEFAULT_LIMITS, useRequest } from '../request'

describe('request limits', () => {
  describe('defaults (no app-level config)', () => {
    const runInContext = prepareTestHttpContext({ url: '/test' })

    it('must return DEFAULT_LIMITS when nothing is configured', () => {
      runInContext(() => {
        const { getMaxCompressed, getMaxInflated, getMaxRatio, getReadTimeoutMs } = useRequest()
        expect(getMaxCompressed()).toBe(DEFAULT_LIMITS.maxCompressed)
        expect(getMaxInflated()).toBe(DEFAULT_LIMITS.maxInflated)
        expect(getMaxRatio()).toBe(DEFAULT_LIMITS.maxRatio)
        expect(getReadTimeoutMs()).toBe(DEFAULT_LIMITS.readTimeoutMs)
      })
    })
  })

  describe('app-level limits', () => {
    const appLimits = {
      maxCompressed: 5 * 1024 * 1024,
      maxInflated: 50 * 1024 * 1024,
      maxRatio: 200,
      readTimeoutMs: 30_000,
    }
    const runInContext = prepareTestHttpContext({ url: '/test', requestLimits: appLimits })

    it('must return app-level limits from context', () => {
      runInContext(() => {
        const { getMaxCompressed, getMaxInflated, getMaxRatio, getReadTimeoutMs } = useRequest()
        expect(getMaxCompressed()).toBe(5 * 1024 * 1024)
        expect(getMaxInflated()).toBe(50 * 1024 * 1024)
        expect(getMaxRatio()).toBe(200)
        expect(getReadTimeoutMs()).toBe(30_000)
      })
    })

    it('must fall back to DEFAULT_LIMITS for omitted keys', () => {
      const partial = prepareTestHttpContext({
        url: '/test',
        requestLimits: { maxCompressed: 2 * 1024 * 1024 },
      })
      partial(() => {
        const { getMaxCompressed, getMaxInflated, getMaxRatio, getReadTimeoutMs } = useRequest()
        expect(getMaxCompressed()).toBe(2 * 1024 * 1024)
        expect(getMaxInflated()).toBe(DEFAULT_LIMITS.maxInflated)
        expect(getMaxRatio()).toBe(DEFAULT_LIMITS.maxRatio)
        expect(getReadTimeoutMs()).toBe(DEFAULT_LIMITS.readTimeoutMs)
      })
    })
  })

  describe('per-request overrides (copy-on-write)', () => {
    const appLimits = {
      maxCompressed: 1024,
      maxInflated: 2048,
      maxRatio: 10,
      readTimeoutMs: 5000,
    }

    it('must override a single limit without mutating the app object', () => {
      const runInContext = prepareTestHttpContext({ url: '/test', requestLimits: appLimits })
      runInContext(() => {
        const { setMaxCompressed, getMaxCompressed, getMaxInflated } = useRequest()
        setMaxCompressed(9999)
        expect(getMaxCompressed()).toBe(9999)
        // other limits still come from app config
        expect(getMaxInflated()).toBe(2048)
      })
      // original object must not be mutated
      expect(appLimits.maxCompressed).toBe(1024)
    })

    it('must set perRequest flag on first setter call', () => {
      const runInContext = prepareTestHttpContext({ url: '/test', requestLimits: appLimits })
      runInContext(() => {
        const { setMaxRatio } = useRequest()
        const ctx = current()

        // before any setter — still the app object (no perRequest)
        expect(ctx.get(httpKind.keys.requestLimits)?.perRequest).toBeFalsy()

        setMaxRatio(50)

        // after setter — should be a new object with perRequest: true
        const obj = ctx.get(httpKind.keys.requestLimits)
        expect(obj?.perRequest).toBe(true)
        expect(obj?.maxRatio).toBe(50)
      })
    })

    it('must not re-clone on subsequent setter calls', () => {
      const runInContext = prepareTestHttpContext({ url: '/test', requestLimits: appLimits })
      runInContext(() => {
        const { setMaxCompressed, setMaxInflated, setMaxRatio, setReadTimeoutMs } = useRequest()
        const ctx = current()

        setMaxCompressed(111)
        const afterFirst = ctx.get(httpKind.keys.requestLimits)

        setMaxInflated(222)
        const afterSecond = ctx.get(httpKind.keys.requestLimits)

        // same object reference — no re-clone
        expect(afterSecond).toBe(afterFirst)

        setMaxRatio(333)
        setReadTimeoutMs(444)

        expect(ctx.get(httpKind.keys.requestLimits)).toBe(afterFirst)
        expect(afterFirst?.maxCompressed).toBe(111)
        expect(afterFirst?.maxInflated).toBe(222)
        expect(afterFirst?.maxRatio).toBe(333)
        expect(afterFirst?.readTimeoutMs).toBe(444)
      })
    })

    it('must work when no app-level limits are set', () => {
      const runInContext = prepareTestHttpContext({ url: '/test' })
      runInContext(() => {
        const { setMaxCompressed, getMaxCompressed, getMaxInflated } = useRequest()
        setMaxCompressed(4096)
        expect(getMaxCompressed()).toBe(4096)
        // non-overridden keys still fall back to DEFAULT_LIMITS
        expect(getMaxInflated()).toBe(DEFAULT_LIMITS.maxInflated)
      })
    })
  })
})
