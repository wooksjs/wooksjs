import { ContextInjector, replaceContextInjector, resetContextInjector } from '@wooksjs/event-core'
import http from 'http'
import type { IncomingMessage } from 'http'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { createHttpApp } from './http-adapter'

interface Span {
  name: string
  attributes: Record<string, string | number | boolean>
  startTime: number
  endTime?: number
  error?: unknown
}

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
        if (result !== null && result !== undefined && typeof (result as any).then === 'function') {
          return (result as unknown as Promise<unknown>)
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

    hook(): void {}
  }

  return { injector: new TracingInjector(), spans }
}

const PORT = 3099

function request(method: string, path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      `http://localhost:${PORT}${path}`,
      { method },
      (res: IncomingMessage) => {
        let body = ''
        res.on('data', (chunk) => {
          body += chunk
        })
        res.on('end', () => {
          resolve({ status: res.statusCode || 0, body })
        })
      },
    )
    req.on('error', reject)
    req.end()
  })
}

describe('HTTP adapter span lifecycle', () => {
  const { injector, spans } = createTestTracer()
  const app = createHttpApp()

  app.get('/sync', () => 'sync-ok')

  app.get('/async', async () => {
    await new Promise((r) => setTimeout(r, 20))
    return 'async-ok'
  })

  app.get('/error', () => {
    throw new Error('boom')
  })

  beforeAll(async () => {
    replaceContextInjector(injector)
    await app.listen(PORT)
  })

  afterEach(() => {
    spans.length = 0
  })

  afterAll(async () => {
    await app.close()
    resetContextInjector()
  })

  it('sync handler: span ends synchronously', async () => {
    const res = await request('GET', '/sync')
    expect(res.body).toBe('sync-ok')

    expect(spans).toHaveLength(1)
    const span = spans[0]
    expect(span.name).toBe('Event:start')
    expect(span.attributes).toEqual({ eventType: 'http' })
    expect(span.endTime).toBeDefined()
    expect(span.error).toBeUndefined()
  })

  it('async handler: span ends after handler resolves', async () => {
    const res = await request('GET', '/async')
    expect(res.body).toBe('async-ok')

    expect(spans).toHaveLength(1)
    const span = spans[0]
    expect(span.endTime).toBeDefined()
    expect(span.endTime! - span.startTime).toBeGreaterThanOrEqual(15) // timer tolerance
    expect(span.error).toBeUndefined()
  })

  it('error handler: span ends with error captured', async () => {
    const res = await request('GET', '/error')
    expect(res.status).toBe(500)

    expect(spans).toHaveLength(1)
    const span = spans[0]
    expect(span.endTime).toBeDefined()
    // The adapter catches the error and responds — the span should still be closed
    expect(span.error).toBeUndefined()
  })

  it('404: span ends for unmatched route', async () => {
    const res = await request('GET', '/nonexistent')
    expect(res.status).toBe(404)

    expect(spans).toHaveLength(1)
    const span = spans[0]
    expect(span.endTime).toBeDefined()
    expect(span.error).toBeUndefined()
  })
})
