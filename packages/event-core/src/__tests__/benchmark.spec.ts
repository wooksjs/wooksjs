import { describe, it, expect } from 'vitest'
import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import {
  key,
  cached,
  cachedBy,
  defineWook,
  defineEventKind,
  slot,
  createEventContext,
  current,
  routeParamsKey,
  useRouteParams as newUseRouteParams,
  useEventId as newUseEventId,
  EventContext,
} from '../index'
import type { Logger } from '../index'

// ============================================================
//  OLD CORE — inline minimal reproduction of event-core patterns
//  (avoids import issues; faithfully reproduces the hot path)
// ============================================================

function createOldCore() {
  const storage = new AsyncLocalStorage<Record<string, any>>()

  function attachHook<T extends object>(
    target: T,
    opts: { get: () => unknown; set?: (v: unknown) => void },
    name = 'value',
  ) {
    Object.defineProperty(target, name, { get: opts.get, set: opts.set })
    return target
  }

  function createAsyncEventContext(data: Record<string, any>) {
    const newContext = { ...data }
    return <T>(cb: () => T): T => storage.run(newContext, cb)
  }

  function useAsyncEventContext() {
    const cc = storage.getStore()!
    // Simulate _getCtxHelpers with store cache
    const _storeCache = new Map<string, any>()

    function store(key: string) {
      const cached = _storeCache.get(key)
      if (cached) {
        return cached
      }

      const getSection = () => cc[key]
      const setSection = (v: unknown) => {
        cc[key] = v
      }

      const obj = { value: null as unknown }

      attachHook(obj, {
        set: (v) => setSection(v),
        get: () => getSection(),
      })

      function init(key2: string, getter: () => unknown) {
        const section = getSection()
        if (section !== undefined && section[key2] !== undefined) {
          return section[key2]
        }
        let s = getSection()
        if (s === undefined) {
          s = {}
          setSection(s)
        }
        s[key2] = getter()
        return s[key2]
      }

      function hook(key2: string) {
        const hookObj = { value: null as unknown, isDefined: false }
        attachHook(hookObj, {
          get: () => {
            const section = getSection()
            return section === undefined ? undefined : section[key2]
          },
          set: (v) => {
            let section = getSection()
            if (section === undefined) {
              section = {}
              setSection(section)
            }
            section[key2] = v
          },
        })
        attachHook(
          hookObj,
          {
            get: () => {
              const section = getSection()
              return section === undefined ? false : section[key2] !== undefined
            },
          },
          'isDefined',
        )
        return hookObj
      }

      Object.assign(obj, {
        init,
        hook,
        set: (k2: string, v: unknown) => {
          let s = getSection()
          if (s === undefined) {
            s = {}
            setSection(s)
          }
          s[k2] = v
          return v
        },
        get: (k2: string) => {
          const s = getSection()
          return s === undefined ? undefined : s[k2]
        },
      })

      _storeCache.set(key, obj)
      return obj
    }

    return { store, getCtx: () => cc }
  }

  // Composables matching event-core patterns
  function useRouteParams() {
    const { store } = useAsyncEventContext()
    const params = store('routeParams').value || {}
    return { params, get: (name: string) => (params as any)[name] }
  }

  function useEventId() {
    const { store } = useAsyncEventContext()
    const { init } = store('event') as any
    const getId = () => init('id', () => randomUUID())
    return { getId }
  }

  // Simulate HTTP composables: useRequest, useResponse, useHeaders, useCookies
  function useRequest() {
    const { store } = useAsyncEventContext()
    const evStore = store('event') as any
    const method = evStore.hook('method')
    const url = evStore.hook('url')
    const reqId = evStore.init('reqId', () => randomUUID())
    return { method, url, reqId, headers: evStore.hook('headers') }
  }

  function useResponse() {
    const { store } = useAsyncEventContext()
    const resStore = store('response') as any
    const status = resStore.hook('status')
    const responded = resStore.hook('responded')
    return { status, responded }
  }

  function useSetHeaders() {
    const { store } = useAsyncEventContext()
    const hStore = store('setHeaders') as any
    return {
      setHeader: (name: string, value: string) => hStore.set(name, value),
      getHeaders: () => hStore.value || {},
    }
  }

  return {
    createAsyncEventContext,
    useRouteParams,
    useEventId,
    useRequest,
    useResponse,
    useSetHeaders,
  }
}

// ============================================================
//  NEW CORE — uses the real @wooksjs/event-core implementation
// ============================================================

const logger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
}

// HTTP kind and composables for new core
const httpKind = defineEventKind('HTTP', {
  req: slot<{ method: string; url: string; headers: Record<string, string> }>(),
  res: slot<{ writable: boolean }>(),
})

const statusKey = key<number>('http.status')
const respondedKey = key<boolean>('http.responded')
const setHeadersKey = key<Record<string, string>>('http.setHeaders')

const newUseRequest = defineWook((ctx) => {
  const req = ctx.get(httpKind.keys.req)
  return {
    method: req.method,
    url: req.url,
    headers: req.headers,
    reqId: () => ctx.get(reqIdSlot),
  }
})

const reqIdSlot = cached(() => randomUUID())

const newUseResponse = defineWook((ctx) => ({
  status: (code?: number) => {
    if (code !== undefined) {
      ctx.set(statusKey, code)
    }
    return ctx.has(statusKey) ? ctx.get(statusKey) : 200
  },
  hasResponded: () => ctx.has(respondedKey) && ctx.get(respondedKey),
}))

const newUseSetHeaders = defineWook((ctx) => {
  if (!ctx.has(setHeadersKey)) {
    ctx.set(setHeadersKey, {})
  }
  const headers = ctx.get(setHeadersKey)
  return {
    setHeader: (name: string, value: string) => {
      headers[name] = value
    },
    getHeaders: () => headers,
  }
})

// ============================================================
//  BENCHMARK
// ============================================================

function bench(name: string, fn: () => void, iterations: number): number {
  // Warmup
  for (let i = 0; i < Math.min(iterations, 1000); i++) {
    fn()
  }

  const start = performance.now()
  for (let i = 0; i < iterations; i++) {
    fn()
  }
  const elapsed = performance.now() - start
  return elapsed
}

const ITERATIONS = 50_000

describe('Performance benchmark: old core vs new core', () => {
  it('simulates a full HTTP request lifecycle', () => {
    const old = createOldCore()

    // --- OLD CORE ---
    const oldTime = bench(
      'old-core',
      () => {
        const run = old.createAsyncEventContext({
          event: {
            type: 'HTTP',
            method: 'GET',
            url: '/users/42',
            headers: { cookie: 'session=abc123' },
          },
          options: {},
          routeParams: { id: '42' },
          response: {},
          setHeaders: {},
        })
        run(() => {
          // Simulate what happens in a typical request handler
          const { params, get } = old.useRouteParams()
          get('id')

          const { getId } = old.useEventId()
          getId()

          const req = old.useRequest()
          void req.method.value
          void req.url.value
          void req.headers.value
          void req.reqId

          const res = old.useResponse()
          res.status.value = 200
          void res.responded.value

          const { setHeader } = old.useSetHeaders()
          setHeader('content-type', 'application/json')
          setHeader('x-request-id', '123')
        })
      },
      ITERATIONS,
    )

    // --- NEW CORE ---
    const newTime = bench(
      'new-core',
      () => {
        createEventContext(
          { logger },
          httpKind,
          {
            req: { method: 'GET', url: '/users/42', headers: { cookie: 'session=abc123' } },
            res: { writable: true },
          },
          () => {
            const ctx = current()
            ctx.set(routeParamsKey, { id: '42' })

            const { params, get } = newUseRouteParams(ctx)
            get('id')

            const { getId } = newUseEventId(ctx)
            getId()

            const { method, url, headers, reqId } = newUseRequest(ctx)
            void method
            void url
            void headers
            reqId()

            const { status, hasResponded } = newUseResponse(ctx)
            status(200)
            hasResponded()

            const { setHeader } = newUseSetHeaders(ctx)
            setHeader('content-type', 'application/json')
            setHeader('x-request-id', '123')
          },
        )
      },
      ITERATIONS,
    )

    // --- NEW CORE (no ctx pass — worst case, multiple ALS lookups) ---
    const newTimeNoCtx = bench(
      'new-core-no-ctx',
      () => {
        createEventContext(
          { logger },
          httpKind,
          {
            req: { method: 'GET', url: '/users/42', headers: { cookie: 'session=abc123' } },
            res: { writable: true },
          },
          () => {
            current().set(routeParamsKey, { id: '42' })

            const { params, get } = newUseRouteParams()
            get('id')

            const { getId } = newUseEventId()
            getId()

            const { method, url, headers, reqId } = newUseRequest()
            void method
            void url
            void headers
            reqId()

            const { status, hasResponded } = newUseResponse()
            status(200)
            hasResponded()

            const { setHeader } = newUseSetHeaders()
            setHeader('content-type', 'application/json')
            setHeader('x-request-id', '123')
          },
        )
      },
      ITERATIONS,
    )

    const speedup = oldTime / newTime
    const speedupNoCtx = oldTime / newTimeNoCtx

    console.log('\n========================================')
    console.log('  BENCHMARK RESULTS')
    console.log('========================================')
    console.log(`  Iterations: ${ITERATIONS.toLocaleString()}`)
    console.log('----------------------------------------')
    console.log(
      `  Old core:           ${oldTime.toFixed(1)}ms  (${((oldTime / ITERATIONS) * 1000).toFixed(2)} µs/op)`,
    )
    console.log(
      `  New core (ctx):     ${newTime.toFixed(1)}ms  (${((newTime / ITERATIONS) * 1000).toFixed(2)} µs/op)`,
    )
    console.log(
      `  New core (no ctx):  ${newTimeNoCtx.toFixed(1)}ms  (${((newTimeNoCtx / ITERATIONS) * 1000).toFixed(2)} µs/op)`,
    )
    console.log('----------------------------------------')
    console.log(`  Speedup (ctx):      ${speedup.toFixed(2)}x`)
    console.log(`  Speedup (no ctx):   ${speedupNoCtx.toFixed(2)}x`)
    console.log('========================================\n')

    // Sanity check — new core should be faster
    expect(newTime).toBeLessThan(oldTime)
  })
})
