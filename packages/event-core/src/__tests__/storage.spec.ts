import { describe, it, expect } from 'vitest'
import {
  run,
  current,
  tryGetCurrent,
  useLogger,
  createEventContext,
  EventContext,
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

describe('AsyncLocalStorage integration', () => {
  describe('run / current', () => {
    it('makes context available via current()', () => {
      const ctx = new EventContext({ logger })
      run(ctx, () => {
        expect(current()).toBe(ctx)
      })
    })

    it('throws when current() is called outside a context', () => {
      expect(() => current()).toThrow('No active event context')
    })

    it('propagates through async operations', async () => {
      const ctx = new EventContext({ logger })
      await run(ctx, async () => {
        await new Promise((r) => setTimeout(r, 1))
        expect(current()).toBe(ctx)
      })
    })

    it('isolates nested contexts', () => {
      const outer = new EventContext({ logger })
      const inner = new EventContext({ logger })

      run(outer, () => {
        expect(current()).toBe(outer)
        run(inner, () => {
          expect(current()).toBe(inner)
        })
        expect(current()).toBe(outer)
      })
    })
  })

  describe('tryGetCurrent', () => {
    it('returns undefined outside a context', () => {
      expect(tryGetCurrent()).toBeUndefined()
    })

    it('returns the current context inside a context', () => {
      const ctx = new EventContext({ logger })
      run(ctx, () => {
        expect(tryGetCurrent()).toBe(ctx)
      })
    })
  })

  describe('useLogger', () => {
    it('returns the logger from the current context', () => {
      const ctx = new EventContext({ logger })
      run(ctx, () => {
        expect(useLogger()).toBe(logger)
      })
    })

    it('accepts explicit ctx parameter', () => {
      const ctx = new EventContext({ logger })
      run(ctx, () => {
        expect(useLogger(ctx)).toBe(logger)
      })
    })
  })

  describe('createEventContext', () => {
    it('creates a bare context and runs fn', () => {
      let ran = false
      createEventContext({ logger }, () => {
        ran = true
        expect(current().logger).toBe(logger)
      })
      expect(ran).toBe(true)
    })

    it('creates context with a kind and seeds', () => {
      const http = defineEventKind('http', {
        method: slot<string>(),
      })

      createEventContext({ logger }, http, { method: 'GET' }, () => {
        const ctx = current()
        expect(ctx.get(http.keys.method)).toBe('GET')
      })
    })

    it('returns the fn return value', () => {
      const result = createEventContext({ logger }, () => 42)
      expect(result).toBe(42)
    })

    it('returns async fn return value', async () => {
      const result = await createEventContext({ logger }, async () => 'async-ok')
      expect(result).toBe('async-ok')
    })

    it('auto-sets eventTypeKey when kind is provided', () => {
      const http = defineEventKind('http', {
        method: slot<string>(),
      })

      createEventContext({ logger }, http, { method: 'GET' }, () => {
        expect(current().get(eventTypeKey)).toBe('http')
      })
    })

    it('does not set eventTypeKey for bare context', () => {
      createEventContext({ logger }, () => {
        expect(current().has(eventTypeKey)).toBe(false)
      })
    })
  })
})
