import { describe, expect, it, vi } from 'vitest'

import { RpcTracker } from '../rpc-tracker'
import { WsClientError } from '../ws-client-error'

describe('RpcTracker', () => {
  it('must generate incrementing IDs', () => {
    const tracker = new RpcTracker()
    expect(tracker.generateId()).toBe(1)
    expect(tracker.generateId()).toBe(2)
    expect(tracker.generateId()).toBe(3)
  })

  it('must resolve pending RPC on success reply', async () => {
    const tracker = new RpcTracker()
    const id = tracker.generateId()
    const promise = tracker.track(id, 5000)

    expect(tracker.size).toBe(1)
    tracker.resolve({ id, data: { result: 'ok' } })
    expect(tracker.size).toBe(0)

    await expect(promise).resolves.toEqual({ result: 'ok' })
  })

  it('must reject pending RPC on error reply', async () => {
    const tracker = new RpcTracker()
    const id = tracker.generateId()
    const promise = tracker.track(id, 5000)

    tracker.resolve({ id, error: { code: 403, message: 'Forbidden' } })

    await expect(promise).rejects.toThrow(WsClientError)
    await expect(promise).rejects.toMatchObject({ code: 403, message: 'Forbidden' })
  })

  it('must reject on timeout', async () => {
    vi.useFakeTimers()
    try {
      const tracker = new RpcTracker()
      const id = tracker.generateId()
      const promise = tracker.track(id, 100)

      vi.advanceTimersByTime(100)

      await expect(promise).rejects.toThrow(WsClientError)
      await expect(promise).rejects.toMatchObject({ code: 408 })
      expect(tracker.size).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('must reject all pending RPCs', async () => {
    const tracker = new RpcTracker()
    const p1 = tracker.track(tracker.generateId(), 5000)
    const p2 = tracker.track(tracker.generateId(), 5000)
    expect(tracker.size).toBe(2)

    tracker.rejectAll(503, 'Connection lost')
    expect(tracker.size).toBe(0)

    await expect(p1).rejects.toMatchObject({ code: 503, message: 'Connection lost' })
    await expect(p2).rejects.toMatchObject({ code: 503, message: 'Connection lost' })
  })

  it('must return false for unknown reply ID', () => {
    const tracker = new RpcTracker()
    expect(tracker.resolve({ id: 999, data: 'nope' })).toBe(false)
  })

  it('must handle string reply IDs', async () => {
    const tracker = new RpcTracker()
    const id = tracker.generateId()
    const promise = tracker.track(id, 5000)

    // Server might echo back the ID as a string
    tracker.resolve({ id: String(id), data: 'ok' })

    await expect(promise).resolves.toBe('ok')
  })
})
