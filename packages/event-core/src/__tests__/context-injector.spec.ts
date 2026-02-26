import { afterEach, describe, it, expect, vi } from 'vitest'
import {
  ContextInjector,
  getContextInjector,
  replaceContextInjector,
  resetContextInjector,
  createEventContext,
  current,
  slot,
  defineEventKind,
  eventTypeKey,
} from '../index'
import type { Logger } from '../index'

const logger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
}

afterEach(() => {
  resetContextInjector()
})

// ── Helpers ──────────────────────────────────────────────────────────

interface Span {
  name: string
  attributes: Record<string, string | number | boolean>
  startTime: number
  endTime?: number
  error?: unknown
}

/**
 * Simulates an OpenTelemetry-style tracer.
 * Records spans with start/end times so tests can verify lifecycle.
 */
function createTestTracer() {
  const spans: Span[] = []

  class TracingInjector extends ContextInjector<string> {
    with<T>(name: string, attributes: Record<string, string | number | boolean>, cb: () => T): T
    with<T>(name: string, cb: () => T): T
    with<T>(
      name: string,
      attributesOrCb: Record<string, string | number | boolean> | (() => T),
      cb?: () => T,
    ): T {
      const attrs = typeof attributesOrCb === 'function' ? {} : attributesOrCb
      const fn = typeof attributesOrCb === 'function' ? attributesOrCb : cb!
      const span: Span = { name, attributes: attrs, startTime: performance.now() }
      spans.push(span)
      try {
        const result = fn()
        // Handle async results — end span when promise settles
        if (result !== null && result !== undefined && typeof (result as any).then === 'function') {
          return (result as Promise<unknown>)
            .then((v) => {
              span.endTime = performance.now()
              return v
            })
            .catch((error) => {
              span.error = error
              span.endTime = performance.now()
              throw error
            }) as T
        }
        span.endTime = performance.now()
        return result
      } catch (error) {
        span.error = error
        span.endTime = performance.now()
        throw error
      }
    }

    hook(_method: string, _name: 'Handler:not_found' | 'Handler:routed', _route?: string): void {
      // hook tracking is done via hookSpy below
    }
  }

  const injector = new TracingInjector()
  const hookSpy = vi.fn<[string, string, string?]>()
  injector.hook = hookSpy

  return { injector, spans, hookSpy }
}

const http = defineEventKind('HTTP', {
  method: slot<string>(),
})

// ── Base class tests ─────────────────────────────────────────────────

describe('ContextInjector', () => {
  it('executes callback and returns result with attributes', () => {
    const ci = new ContextInjector()
    const result = ci.with('Event:start', { eventType: 'TEST' }, () => 42)
    expect(result).toBe(42)
  })

  it('executes callback and returns result without attributes', () => {
    const ci = new ContextInjector()
    const result = ci.with('Event:start', () => 'hello')
    expect(result).toBe('hello')
  })

  it('has a no-op hook method', () => {
    const ci = new ContextInjector()
    expect(() => ci.hook('GET', 'Handler:not_found')).not.toThrow()
    expect(() => ci.hook('POST', 'Handler:routed', '/api/test')).not.toThrow()
  })
})

// ── Singleton management ─────────────────────────────────────────────

describe('getContextInjector / replaceContextInjector', () => {
  it('returns null when no injector has been installed', () => {
    expect(getContextInjector()).toBeNull()
  })

  it('replaces the global injector', () => {
    const custom = new ContextInjector()
    replaceContextInjector(custom)
    expect(getContextInjector()).toBe(custom)
  })

  it('resetContextInjector sets injector back to null', () => {
    replaceContextInjector(new ContextInjector())
    resetContextInjector()
    expect(getContextInjector()).toBeNull()
  })
})

// ── No injector (null) — zero overhead path ──────────────────────────

describe('no injector installed', () => {
  it('sync handler runs without error', () => {
    const result = createEventContext({ logger }, http, { method: 'GET' }, () => 'ok')
    expect(result).toBe('ok')
  })

  it('async handler runs without error', async () => {
    const result = await createEventContext({ logger }, http, { method: 'POST' }, async () => {
      await new Promise((r) => setTimeout(r, 5))
      return 'async-ok'
    })
    expect(result).toBe('async-ok')
  })

  it('handler error propagates', () => {
    expect(() =>
      createEventContext({ logger }, http, { method: 'GET' }, () => {
        throw new Error('boom')
      }),
    ).toThrow('boom')
  })
})

// ── Span lifecycle ───────────────────────────────────────────────────

describe('span lifecycle', () => {
  it('sync handler: span starts before and ends after handler', () => {
    const { injector, spans } = createTestTracer()
    replaceContextInjector(injector)

    let handlerTime = 0
    createEventContext({ logger }, http, { method: 'GET' }, () => {
      handlerTime = performance.now()
    })

    expect(spans).toHaveLength(1)
    const span = spans[0]
    expect(span.name).toBe('Event:start')
    expect(span.attributes).toEqual({ eventType: 'HTTP' })
    expect(span.startTime).toBeLessThanOrEqual(handlerTime)
    expect(span.endTime).toBeDefined()
    expect(span.endTime!).toBeGreaterThanOrEqual(handlerTime)
    expect(span.error).toBeUndefined()
  })

  it('sync handler: span captures return value passthrough', () => {
    const { injector } = createTestTracer()
    replaceContextInjector(injector)

    const result = createEventContext({ logger }, http, { method: 'GET' }, () => 42)
    expect(result).toBe(42)
  })

  it('async handler: span covers full await duration', async () => {
    const { injector, spans } = createTestTracer()
    replaceContextInjector(injector)

    const DELAY = 20
    const result = await createEventContext({ logger }, http, { method: 'POST' }, async () => {
      await new Promise((r) => setTimeout(r, DELAY))
      return 'async-result'
    })

    expect(result).toBe('async-result')
    expect(spans).toHaveLength(1)
    const span = spans[0]
    expect(span.endTime).toBeDefined()
    expect(span.endTime! - span.startTime).toBeGreaterThanOrEqual(DELAY - 5) // timer tolerance
    expect(span.error).toBeUndefined()
  })

  it('sync handler error: span ends and records error', () => {
    const { injector, spans } = createTestTracer()
    replaceContextInjector(injector)

    const err = new Error('handler-crash')
    expect(() =>
      createEventContext({ logger }, http, { method: 'GET' }, () => {
        throw err
      }),
    ).toThrow(err)

    expect(spans).toHaveLength(1)
    expect(spans[0].endTime).toBeDefined()
    expect(spans[0].error).toBe(err)
  })

  it('async handler rejection: span ends and records error', async () => {
    const { injector, spans } = createTestTracer()
    replaceContextInjector(injector)

    const err = new Error('async-crash')
    await expect(
      createEventContext({ logger }, http, { method: 'POST' }, async () => {
        await new Promise((r) => setTimeout(r, 5))
        throw err
      }),
    ).rejects.toThrow(err)

    expect(spans).toHaveLength(1)
    expect(spans[0].endTime).toBeDefined()
    expect(spans[0].error).toBe(err)
  })

  it('attributes contain correct eventType for different kinds', () => {
    const { injector, spans } = createTestTracer()
    replaceContextInjector(injector)

    const cli = defineEventKind('CLI', { command: slot<string>() })
    const ws = defineEventKind('WS', { id: slot<string>() })

    createEventContext({ logger }, http, { method: 'GET' }, () => {})
    createEventContext({ logger }, cli, { command: 'test' }, () => {})
    createEventContext({ logger }, ws, { id: 'conn-1' }, () => {})

    expect(spans).toHaveLength(3)
    expect(spans[0].attributes).toEqual({ eventType: 'HTTP' })
    expect(spans[1].attributes).toEqual({ eventType: 'CLI' })
    expect(spans[2].attributes).toEqual({ eventType: 'WS' })
  })
})

// ── seed() does not trigger CI ───────────────────────────────────────

describe('seed() does not trigger CI (optimized hot path)', () => {
  it('does NOT call CI when seeding with callback', () => {
    const { injector, spans } = createTestTracer()
    replaceContextInjector(injector)

    const wf = defineEventKind('WF', {
      triggerId: slot<string>(),
    })

    createEventContext({ logger }, () => {
      const spansBefore = spans.length

      current().seed(wf, { triggerId: 'wf-001' }, () => {
        expect(current().get(wf.keys.triggerId)).toBe('wf-001')
        expect(current().get(eventTypeKey)).toBe('WF')
      })

      // No new span created by seed()
      expect(spans.length).toBe(spansBefore)
    })
  })

  it('does NOT call CI when seeding without callback', () => {
    const { injector, spans } = createTestTracer()
    replaceContextInjector(injector)

    const wf = defineEventKind('WF', {
      triggerId: slot<string>(),
    })

    createEventContext({ logger }, () => {
      const spansBefore = spans.length
      current().seed(wf, { triggerId: 'wf-001' })
      expect(spans.length).toBe(spansBefore)
      expect(current().get(wf.keys.triggerId)).toBe('wf-001')
    })
  })
})

// ── Bare context (no kind) skips CI ──────────────────────────────────

describe('bare context (no kind)', () => {
  it('does NOT call CI.with', () => {
    const { injector, spans } = createTestTracer()
    replaceContextInjector(injector)

    createEventContext({ logger }, () => {
      // bare context, no kind
    })

    expect(spans).toHaveLength(0)
  })

  it('does not set eventTypeKey', () => {
    createEventContext({ logger }, () => {
      expect(current().has(eventTypeKey)).toBe(false)
    })
  })
})
