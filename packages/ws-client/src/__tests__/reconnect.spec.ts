import { describe, expect, it, vi } from 'vitest'

import { ReconnectController, normalizeReconnectConfig } from '../reconnect'

describe('normalizeReconnectConfig', () => {
  it('must expand true to default config', () => {
    const config = normalizeReconnectConfig(true)
    expect(config).toEqual({
      enabled: true,
      maxRetries: Infinity,
      baseDelay: 1000,
      maxDelay: 30_000,
      backoff: 'exponential',
    })
  })

  it('must expand false to disabled config', () => {
    const config = normalizeReconnectConfig(false)
    expect(config.enabled).toBe(false)
  })

  it('must expand undefined to disabled config', () => {
    const config = normalizeReconnectConfig(undefined)
    expect(config.enabled).toBe(false)
  })

  it('must merge partial options with defaults', () => {
    const config = normalizeReconnectConfig({
      enabled: true,
      baseDelay: 500,
      backoff: 'linear',
    })
    expect(config).toEqual({
      enabled: true,
      maxRetries: Infinity,
      baseDelay: 500,
      maxDelay: 30_000,
      backoff: 'linear',
    })
  })
})

describe('ReconnectController', () => {
  it('must schedule with exponential backoff', () => {
    vi.useFakeTimers()
    try {
      const ctrl = new ReconnectController(normalizeReconnectConfig(true))
      const callbacks: number[] = []

      // Attempt 0: delay = 1000 * 2^0 = 1000
      ctrl.schedule(() => callbacks.push(0))
      vi.advanceTimersByTime(1000)
      expect(callbacks).toEqual([0])

      // Attempt 1: delay = 1000 * 2^1 = 2000
      ctrl.schedule(() => callbacks.push(1))
      vi.advanceTimersByTime(2000)
      expect(callbacks).toEqual([0, 1])

      // Attempt 2: delay = 1000 * 2^2 = 4000
      ctrl.schedule(() => callbacks.push(2))
      vi.advanceTimersByTime(4000)
      expect(callbacks).toEqual([0, 1, 2])
    } finally {
      vi.useRealTimers()
    }
  })

  it('must schedule with linear backoff', () => {
    vi.useFakeTimers()
    try {
      const ctrl = new ReconnectController(
        normalizeReconnectConfig({
          enabled: true,
          backoff: 'linear',
          baseDelay: 500,
        }),
      )
      const callbacks: number[] = []

      // Attempt 0: delay = 500 * 1 = 500
      ctrl.schedule(() => callbacks.push(0))
      vi.advanceTimersByTime(500)
      expect(callbacks).toEqual([0])

      // Attempt 1: delay = 500 * 2 = 1000
      ctrl.schedule(() => callbacks.push(1))
      vi.advanceTimersByTime(1000)
      expect(callbacks).toEqual([0, 1])
    } finally {
      vi.useRealTimers()
    }
  })

  it('must cap delay at maxDelay', () => {
    vi.useFakeTimers()
    try {
      const ctrl = new ReconnectController({
        enabled: true,
        maxRetries: Infinity,
        baseDelay: 10_000,
        maxDelay: 15_000,
        backoff: 'exponential',
      })

      // Attempt 0: delay = min(10000 * 2^0, 15000) = 10000
      const fn0 = vi.fn()
      ctrl.schedule(fn0)
      vi.advanceTimersByTime(10_000)
      expect(fn0).toHaveBeenCalled()

      // Attempt 1: delay = min(10000 * 2^1, 15000) = 15000 (capped)
      const fn1 = vi.fn()
      ctrl.schedule(fn1)
      vi.advanceTimersByTime(15_000)
      expect(fn1).toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('must respect maxRetries', () => {
    const ctrl = new ReconnectController(
      normalizeReconnectConfig({
        enabled: true,
        maxRetries: 2,
      }),
    )

    expect(ctrl.schedule(() => {})).toBe(true) // attempt 0
    expect(ctrl.schedule(() => {})).toBe(true) // attempt 1
    expect(ctrl.schedule(() => {})).toBe(false) // exceeded
  })

  it('must reset attempt counter', () => {
    const ctrl = new ReconnectController(
      normalizeReconnectConfig({
        enabled: true,
        maxRetries: 2,
      }),
    )

    ctrl.schedule(() => {})
    ctrl.schedule(() => {})
    ctrl.reset()

    // After reset, attempts start over
    expect(ctrl.schedule(() => {})).toBe(true)
    expect(ctrl.schedule(() => {})).toBe(true)
  })

  it('must stop permanently', () => {
    const ctrl = new ReconnectController(normalizeReconnectConfig(true))
    ctrl.stop()

    expect(ctrl.enabled).toBe(false)
    expect(ctrl.schedule(() => {})).toBe(false)
  })

  it('must not be enabled when config is disabled', () => {
    const ctrl = new ReconnectController(normalizeReconnectConfig(false))
    expect(ctrl.enabled).toBe(false)
  })
})
