import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Wooks } from 'wooks'

import { useResponse } from '../composables/response'
import { createHttpApp } from '../http-adapter'
import type { WooksHttp } from '../http-adapter'
import { HttpError } from './http-error'

/*
 * Review R4-M2 + L6 — a failure response is never storable by a cache (RFC 9111 §3), even when
 * the handler had set freshness headers before the failure:
 *  - every response rendered through the error path (thrown or returned errors, the router's
 *    404, the automatic 412) drops Cache-Control / Expires and carries `Cache-Control: no-store`;
 *  - a failure status the HANDLER builds itself (`setStatus(404)` + a body) is left alone — that
 *    is how a deliberately cacheable error response is sent;
 *  - the automatic 412 renders the standard error body (through `transformErrorBody`) for GET,
 *    and no body for HEAD.
 * Generated over method × precondition × handler cache headers × source × path.
 */

const quiet = { info() {}, warn() {}, error() {}, log() {}, debug() {}, trace() {} } as never

const CACHE: Record<string, Record<string, string>> = {
  none: {},
  'public max-age': { 'cache-control': 'public, max-age=600' },
  'max-age': { 'cache-control': 'max-age=60' },
  's-maxage': { 'cache-control': 's-maxage=60' },
  'private max-age': { 'cache-control': 'private, max-age=60' },
  expires: { expires: 'Thu, 01 Jan 2099 00:00:00 GMT' },
  'expires + cache-control': {
    expires: 'Thu, 01 Jan 2099 00:00:00 GMT',
    'Cache-Control': 'max-age=60',
  },
}
const PRECONDITIONS: Record<string, Record<string, string>> = {
  none: {},
  'If-Match stale': { 'if-match': '"v1"' },
  'If-Unmodified-Since earlier': { 'if-unmodified-since': 'Thu, 01 Jan 2004 00:00:00 GMT' },
}
const SOURCES = [
  'ok',
  'throws 409',
  'throws plain Error',
  'returns 404',
  'router 404',
  'handler-built 404',
] as const
const HEURISTIC = new Set([200, 203, 204, 206, 300, 301, 308, 404, 405, 410, 414, 501])

/** RFC 9111 §3 — whether a shared or private cache may store the response. */
function storable(status: number, headers: Headers): boolean {
  const cc = new Set(
    (headers.get('cache-control') ?? '')
      .toLowerCase()
      .split(',')
      .map((d) => d.trim().split('=')[0]),
  )
  if (cc.has('no-store')) {
    return false
  }
  if (
    ['public', 'private', 'max-age', 's-maxage'].some((d) => cc.has(d)) ||
    headers.has('expires')
  ) {
    return true
  }
  return HEURISTIC.has(status)
}

function safeJson(text: string): { message?: string } | undefined {
  try {
    return JSON.parse(text) as { message?: string }
  } catch {
    return undefined
  }
}

let app: WooksHttp
let base: string

beforeAll(async () => {
  app = createHttpApp(
    {
      logger: quiet,
      transformErrorBody: (body) => ({ ...body, message: `T:${body.message}` }),
    },
    new Wooks(),
  )
  for (const [ci, cache] of Object.values(CACHE).entries()) {
    const setCache = () => {
      const r = useResponse()
      r.setHeader('etag', '"v2"').setHeader('last-modified', 'Thu, 01 Jan 2026 00:00:00 GMT')
      for (const [k, v] of Object.entries(cache)) {
        r.setHeader(k, v)
      }
      return r
    }
    const c = `c${ci}`
    app.all(`/${c}/ok`, () => {
      setCache()
      return { ok: true }
    })
    app.all(`/${c}/throws 409`.replace(' ', '-'), () => {
      setCache()
      throw new HttpError(409, 'taken')
    })
    app.all(`/${c}/throws-plain-Error`, () => {
      setCache()
      throw new Error('boom')
    })
    app.all(`/${c}/returns-404`, () => {
      setCache()
      return new HttpError(404)
    })
    app.all(`/${c}/handler-built-404`, () => {
      setCache().setStatus(404)
      return { gone: true }
    })
  }
  await app.listen(0, '127.0.0.1')
  base = `http://127.0.0.1:${(app.getServer()!.address() as { port: number }).port}`
})
afterAll(() => app.close())

describe('failure responses are never storable', () => {
  for (const method of ['GET', 'HEAD']) {
    for (const [ci, [cName, cache]] of Object.entries(CACHE).entries()) {
      it(`${method}, handler cache headers: ${cName}`, async () => {
        const problems: string[] = []
        for (const [pName, pre] of Object.entries(PRECONDITIONS)) {
          for (const source of SOURCES) {
            const path =
              source === 'router 404' ? `/c${ci}/nowhere` : `/c${ci}/${source.replaceAll(' ', '-')}`
            const headers = { ...pre, accept: 'application/json' }
            const viaSocket = await fetch(`${base}${path}`, { method, headers })
            const viaFetch = await app.request(path, { method, headers })
            for (const [via, res] of [
              ['socket', viaSocket],
              ['fetch', viaFetch],
            ] as const) {
              if (!res) {
                continue // an unmatched route has no in-process response
              }
              const label = `${pName} / ${source} / ${via}`
              const text = await res.text()
              if (source === 'handler-built 404') {
                // the handler's own response: untouched
                for (const [k, v] of Object.entries(cache)) {
                  if (res.headers.get(k.toLowerCase()) !== v) {
                    problems.push(`${label}: handler header ${k} changed to ${res.headers.get(k)}`)
                  }
                }
                continue
              }
              if (res.status >= 400 && storable(res.status, res.headers)) {
                problems.push(
                  `${label}: ${res.status} is storable (${res.headers.get('cache-control')})`,
                )
              }
              if (
                res.status === 412 &&
                (method === 'HEAD' ? text !== '' : safeJson(text)?.message !== 'T:')
              ) {
                problems.push(`${label}: 412 body ${JSON.stringify(text)}`)
              }
              if (source === 'ok' && pName !== 'none' && res.status !== 412) {
                problems.push(`${label}: expected 412, got ${res.status}`)
              }
            }
          }
        }
        expect(problems.slice(0, 10), `${problems.length} problems`).toEqual([])
      })
    }
  }
})

/*
 * Review R5 — what SURVIVES the error path: everything that is not representation metadata
 * or freshness. Cookies, CORS, auth challenges, retry hints, redirects, Vary and custom headers
 * a handler set before failing go out with the error response.
 */
describe('headers that survive the error path', () => {
  let sapp: WooksHttp
  let sbase: string
  const KEPT: Record<string, string> = {
    'access-control-allow-origin': 'https://app.example',
    'access-control-allow-credentials': 'true',
    'access-control-expose-headers': 'X-Request-Id',
    'www-authenticate': 'Bearer realm="api"',
    'retry-after': '120',
    location: '/elsewhere',
    vary: 'Origin',
    'x-custom': 'kept',
  }
  const ERROR_SOURCES: Record<string, () => unknown> = {
    'throws 401': () => {
      throw new HttpError(401, 'who are you')
    },
    'throws plain Error': () => {
      throw new Error('boom')
    },
    'returns 503': () => new HttpError(503, 'later'),
    'automatic 412': () => ({ ok: true }),
  }
  beforeAll(async () => {
    sapp = createHttpApp({ logger: quiet }, new Wooks())
    for (const [i, fail] of Object.values(ERROR_SOURCES).entries()) {
      sapp.all(`/s${i}`, () => {
        const r = useResponse()
        r.setCookie('session', 'abc', { httpOnly: true }).setCookie('theme', 'dark')
        r.setHeader('etag', '"v2"').setHeader('cache-control', 'public, max-age=600')
        for (const [k, v] of Object.entries(KEPT)) {
          // mixed casing on purpose
          r.setHeader(k.toUpperCase(), v)
        }
        return fail()
      })
    }
    await sapp.listen(0, '127.0.0.1')
    sbase = `http://127.0.0.1:${(sapp.getServer()!.address() as { port: number }).port}`
  })
  afterAll(() => sapp.close())

  for (const [i, source] of Object.keys(ERROR_SOURCES).entries()) {
    for (const method of ['GET', 'HEAD']) {
      it(`${source}, ${method}`, async () => {
        const headers = { accept: 'application/json', 'if-match': '"stale"' }
        const viaSocket = await fetch(`${sbase}/s${i}`, { method, headers })
        const viaFetch = (await sapp.request(`/s${i}`, { method, headers }))!
        for (const [via, res] of [
          ['socket', viaSocket],
          ['fetch', viaFetch],
        ] as const) {
          expect(res.status, via).toBeGreaterThanOrEqual(400)
          for (const [k, v] of Object.entries(KEPT)) {
            expect(res.headers.get(k), `${via}: ${k}`).toBe(v)
          }
          const cookies = res.headers.getSetCookie()
          expect(cookies.some((c) => c.startsWith('session=abc')), `${via}: session cookie`).toBe(true)
          expect(cookies.some((c) => c.startsWith('theme=dark')), `${via}: theme cookie`).toBe(true)
          expect(res.headers.get('cache-control'), via).toBe('no-store')
        }
      })
    }
  }
})
