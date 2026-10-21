import { useRouteParams } from '@wooksjs/event-core'
import { Readable } from 'stream'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Wooks } from 'wooks'

import { useResponse } from '../composables/response'
import { createHttpApp } from '../http-adapter'
import type { WooksHttp } from '../http-adapter'
import { prerenderJson } from './prerender'

/*
 * Conditional GET contract (RFC 9110 §13.1, §13.2.2), applied to EVERY response:
 *  - only GET/HEAD answers with status 200 are eligible;
 *  - If-Match (strong comparison, `*`) that fails → 412; else If-Unmodified-Since (one valid
 *    HTTP-date) earlier than Last-Modified → 412;
 *  - If-None-Match present → 304 iff the response has an ETag that weakly matches an entry
 *    (or the entry is `*`); If-Modified-Since is then ignored;
 *  - otherwise If-Modified-Since present → 304 iff the response has a Last-Modified that is not
 *    later than it (whole seconds). It is ignored unless it is ONE valid HTTP-date (IMF-fixdate,
 *    RFC 850 or asctime form) that is not in the future (RFC 9110 §5.6.7, §13.1.3);
 *  - a 304 keeps ETag / Last-Modified / Cache-Control / Vary / cookies / security headers and
 *    drops the body and the representation headers Content-Type / -Length / -Encoding /
 *    -Language / -Range / -MD5 (RFC 9110 §15.4.5) — Content-Location and
 *    Content-Security-Policy(-Report-Only) stay.
 * The oracle below states that rule. Dates are given with their epoch values (the oracle never
 * parses a date); the matrix walks method × status × validators × request conditions × body
 * kind × send path (socket and in-process fetch).
 */

const LM = 'Wed, 21 Oct 2026 10:00:00 GMT'
const LM_MS = Date.UTC(2026, 9, 21, 10, 0, 0)
const httpDate = (ms: number) => new Date(ms).toUTCString()

interface Validators {
  etag?: string
  lastModified?: string
}
const VALIDATORS: Record<string, Validators> = {
  none: {},
  strong: { etag: '"v1"' },
  weak: { etag: 'W/"v1"' },
  lastmod: { lastModified: LM },
  both: { etag: '"v1"', lastModified: LM },
}

/** Epoch (ms) of each valid If-Modified-Since value used below; anything else is invalid. */
const IMS_EPOCH = new Map<string, number>([
  [LM, LM_MS],
  [httpDate(LM_MS + 60_000), LM_MS + 60_000],
  [httpDate(LM_MS - 1000), LM_MS - 1000],
  ['Wednesday, 21-Oct-26 10:00:00 GMT', LM_MS], // RFC 850
  ['Wed Oct 21 10:00:00 2026', LM_MS], // asctime
  ['Wed Oct  7 10:00:00 2026', Date.UTC(2026, 9, 7, 10, 0, 0)], // asctime, space-padded day
  ['Thu, 01 Jan 2099 00:00:00 GMT', Date.UTC(2099, 0, 1)], // valid, but in the future
])

const CONDITIONS: Record<string, Record<string, string>> = {
  'no conditions': {},
  'INM strong match': { 'if-none-match': '"v1"' },
  'INM weak match': { 'if-none-match': 'W/"v1"' },
  'INM in list': { 'if-none-match': '"x", W/"v1" , "y"' },
  'INM *': { 'if-none-match': '*' },
  'INM other': { 'if-none-match': '"v2"' },
  'IMS equal': { 'if-modified-since': LM },
  'IMS later': { 'if-modified-since': httpDate(LM_MS + 60_000) },
  'IMS earlier': { 'if-modified-since': httpDate(LM_MS - 1000) },
  'IMS invalid': { 'if-modified-since': 'yesterday' },
  'IMS bare year': { 'if-modified-since': '2026' },
  'IMS bare number': { 'if-modified-since': '1' },
  'IMS ISO date': { 'if-modified-since': '2027-01-01T00:00:00Z' },
  'IMS non-GMT zone': { 'if-modified-since': 'Wed, 21 Oct 2026 10:00:00 PST' },
  'IMS two members': {
    'if-modified-since': 'Fri, 01 Jan 2027 00:00:00 GMT, Sat, 01 Jan 2000 00:00:00 GMT',
  },
  'IMS in the future': { 'if-modified-since': 'Thu, 01 Jan 2099 00:00:00 GMT' },
  'IMS RFC 850 equal': { 'if-modified-since': 'Wednesday, 21-Oct-26 10:00:00 GMT' },
  'IMS asctime equal': { 'if-modified-since': 'Wed Oct 21 10:00:00 2026' },
  'IMS asctime earlier (padded day)': { 'if-modified-since': 'Wed Oct  7 10:00:00 2026' },
  'IMS bad day of month': { 'if-modified-since': 'Wed, 32 Oct 2026 10:00:00 GMT' },
  'INM other + IMS later': {
    'if-none-match': '"v2"',
    'if-modified-since': httpDate(LM_MS + 60_000),
  },
  'INM match + IMS earlier': {
    'if-none-match': '"v1"',
    'if-modified-since': httpDate(LM_MS - 1000),
  },
  'IM match': { 'if-match': '"v1"' },
  'IM weak form': { 'if-match': 'W/"v1"' },
  'IM stale': { 'if-match': '"v2"' },
  'IM *': { 'if-match': '*' },
  'IM in list': { 'if-match': '"x", "v1"' },
  'IUS equal': { 'if-unmodified-since': LM },
  'IUS later': { 'if-unmodified-since': httpDate(LM_MS + 60_000) },
  'IUS earlier': { 'if-unmodified-since': httpDate(LM_MS - 1000) },
  'IUS invalid': { 'if-unmodified-since': '2026' },
  'IUS in the future': { 'if-unmodified-since': 'Thu, 01 Jan 2099 00:00:00 GMT' },
  'IM stale + INM match': { 'if-match': '"v2"', 'if-none-match': '"v1"' },
  'IM match + INM match': { 'if-match': '"v1"', 'if-none-match': '"v1"' },
  'IM match + IUS earlier': { 'if-match': '"v1"', 'if-unmodified-since': httpDate(LM_MS - 1000) },
  'IUS earlier + INM match': {
    'if-unmodified-since': httpDate(LM_MS - 1000),
    'if-none-match': '"v1"',
  },
  'IUS later + IMS equal': {
    'if-unmodified-since': httpDate(LM_MS + 60_000),
    'if-modified-since': LM,
  },
}

function weakEq(a: string, b: string) {
  return a.replace(/^W\//u, '') === b.replace(/^W\//u, '')
}

/** RFC 9110 §13.2.2 evaluation order, for the eligibility rule above. */
function oracle(
  method: string,
  status: number,
  v: Validators,
  cond: Record<string, string>,
): number {
  // preconditions apply to any 2xx answer (RFC 9110 §13.2.1); a 304 only to a 200 (§15.4.5)
  if ((method !== 'GET' && method !== 'HEAD') || status < 200 || status > 299) {
    return status
  }
  // 1. If-Match — strong comparison; `*` = a current representation exists (it does: 200)
  const im = cond['if-match']
  if (im === undefined) {
    // 2. If-Unmodified-Since — only without If-Match, only a valid date, only with Last-Modified
    const ius = cond['if-unmodified-since']
    const until = ius === undefined ? undefined : IMS_EPOCH.get(ius)
    if (until !== undefined && v.lastModified && LM_MS > until) {
      return 412
    }
  } else {
    const tags = im.split(',').map((t) => t.trim())
    const strongTag = v.etag && !v.etag.startsWith('W/') ? v.etag : undefined
    if (!tags.some((t) => t === '*' || (strongTag !== undefined && t === strongTag))) {
      return 412
    }
  }
  const inm = cond['if-none-match']
  if (inm !== undefined) {
    // `*` matches any current representation — this response is one, ETag or not
    const tags = inm.split(',').map((t) => t.trim())
    const matches = tags.some((t) => t === '*' || (v.etag !== undefined && weakEq(t, v.etag)))
    return matches && status === 200 ? 304 : status
  }
  const ims = cond['if-modified-since']
  const since = ims === undefined ? undefined : IMS_EPOCH.get(ims)
  if (since !== undefined && since <= Date.now() && v.lastModified && status === 200) {
    return LM_MS <= since ? 304 : 200
  }
  return status
}

const BODIES: Record<string, () => unknown> = {
  json: () => ({ ok: true }),
  text: () => 'hello',
  stream: () => Readable.from([Buffer.from('hel'), Buffer.from('lo')]),
  fetch: () => new Response('hello', { headers: { 'content-type': 'text/plain' } }),
}
const STATUSES = [200, 201, 203, 404]
const METHODS = ['GET', 'HEAD', 'POST', 'PUT']

let app: WooksHttp
let base: string

beforeAll(async () => {
  app = createHttpApp(undefined, new Wooks())
  app.all('/r/:status/:validators/:body', () => {
    const { status, validators, body } = useRouteParams<Record<string, string>>().params
    const response = useResponse()
    response.setStatus(Number(status) as 200)
    const v = VALIDATORS[validators]
    if (v.etag) {
      response.setHeader('ETag', v.etag)
    }
    if (v.lastModified) {
      response.setHeader('last-modified', v.lastModified)
    }
    response
      .setHeader('cache-control', 'no-cache')
      .setHeader('vary', 'Accept')
      .setHeader('content-language', 'de')
      .setHeader('Content-Location', '/canonical')
      .setHeader('content-security-policy', "default-src 'none'")
      .setHeader('Content-Security-Policy-Report-Only', "script-src 'self'")
    return BODIES[body]()
  })
  app.get('/prerendered-custom', () => prerenderJson({ big: 'payload' }, { etag: 'W/"rev-7"' }))
  app.get('/prerendered-custom-explicit', () => {
    useResponse().setHeader('etag', '"mine"')
    return prerenderJson({ big: 'payload' }, { etag: 'W/"rev-7"' })
  })
  await app.listen(0, '127.0.0.1')
  base = `http://127.0.0.1:${(app.getServer()!.address() as { port: number }).port}`
})

afterAll(() => app.close())

describe('conditional GET (automatic 304)', () => {
  for (const method of METHODS) {
    for (const status of STATUSES) {
      for (const [vName, v] of Object.entries(VALIDATORS)) {
        for (const [cName, cond] of Object.entries(CONDITIONS)) {
          const expected = oracle(method, status, v, cond)
          it(`${method} ${status} ${vName} / ${cName} → ${expected}`, async () => {
            for (const body of Object.keys(BODIES)) {
              const path = `/r/${status}/${vName}/${body}`
              const viaSocket = await fetch(`${base}${path}`, { method, headers: cond })
              const viaFetch = (await app.request(path, { method, headers: cond }))!
              for (const [via, res] of [
                ['socket', viaSocket],
                ['fetch()', viaFetch],
              ] as const) {
                const label = `${body} via ${via}`
                expect(res.status, label).toBe(expected)
                const text = await res.text()
                if (expected === 412) {
                  // the standard error body (GET) / none (HEAD); never storable
                  if (method === 'HEAD') {
                    expect(text, label).toBe('')
                  } else {
                    expect(JSON.parse(text), label).toMatchObject({ statusCode: 412 })
                  }
                  expect(res.headers.get('cache-control'), label).toBe('no-store')
                  expect(res.headers.get('content-language'), label).toBeNull()
                } else if (expected === 304) {
                  expect(text, label).toBe('')
                  expect(res.headers.get('content-type'), label).toBeNull()
                  expect(res.headers.get('content-language'), label).toBeNull()
                  expect(res.headers.get('content-location'), label).toBe('/canonical')
                  // not representation metadata — security headers stay on a 304
                  expect(res.headers.get('content-security-policy'), label).toBe(
                    "default-src 'none'",
                  )
                  expect(res.headers.get('content-security-policy-report-only'), label).toBe(
                    "script-src 'self'",
                  )
                  expect(res.headers.get('etag'), label).toBe(v.etag ?? null)
                  expect(res.headers.get('last-modified'), label).toBe(v.lastModified ?? null)
                  expect(res.headers.get('cache-control'), label).toBe('no-cache')
                  expect(res.headers.get('vary'), label).toBe('Accept')
                } else if (method !== 'HEAD') {
                  expect(text, label).not.toBe('')
                }
              }
            }
          })
        }
      }
    }
  }
})

describe('prerenderJson with a custom string etag', () => {
  it('sends it and answers a matching If-None-Match with 304', async () => {
    const first = await fetch(`${base}/prerendered-custom`)
    expect(first.headers.get('etag')).toBe('W/"rev-7"')
    expect(await first.json()).toEqual({ big: 'payload' })
    const again = await fetch(`${base}/prerendered-custom`, {
      headers: { 'if-none-match': '"rev-7"' },
    })
    expect(again.status).toBe(304)
  })

  it('an explicit ETag header wins over the prerendered one, and is what 304 is judged on', async () => {
    const mine = await fetch(`${base}/prerendered-custom-explicit`, {
      headers: { 'if-none-match': '"mine"' },
    })
    expect(mine.status).toBe(304)
    const theirs = await fetch(`${base}/prerendered-custom-explicit`, {
      headers: { 'if-none-match': 'W/"rev-7"' },
    })
    expect(theirs.status).toBe(200)
    expect(theirs.headers.get('etag')).toBe('"mine"')
  })

  it('rejects an etag that is not a quoted entity tag', () => {
    expect(() => prerenderJson({ a: 1 }, { etag: 'rev-7' })).toThrow(TypeError)
    expect(() => prerenderJson({ a: 1 }, { etag: '"a"b"' })).toThrow(TypeError)
  })
})

/*
 * Simplify review (altitude) — If-Match / If-Unmodified-Since are judged on the status the
 * response WILL have: a handler status, else a returned fetch Response's own status. Only a
 * 2xx answer becomes 412; a fetch Response with any other status keeps it. Generated over
 * status × failing precondition × method × send path.
 */
describe('preconditions judge the status the response will have', () => {
  let papp: WooksHttp
  let pbase: string
  const STATUSES = [200, 201, 203, 206, 301, 302, 400, 404, 409, 410, 500, 503]
  const FAILING: Record<string, Record<string, string>> = {
    'If-Match other': { 'if-match': '"x"' },
    'If-Match weak': { 'if-match': 'W/"v1"' },
    'If-Unmodified-Since earlier': { 'if-unmodified-since': httpDate(LM_MS - 1000) },
  }
  const SOURCES: Record<string, (status: number) => unknown> = {
    'fetch Response status': (status) =>
      new Response(status === 204 ? null : 'body', {
        status,
        headers: { etag: '"v1"', 'last-modified': LM, 'content-type': 'text/plain' },
      }),
    'handler status': (status) => {
      useResponse().setStatus(status).setHeader('etag', '"v1"').setHeader('last-modified', LM)
      return 'body'
    },
  }

  beforeAll(async () => {
    papp = createHttpApp(undefined, new Wooks())
    for (const [i, make] of Object.values(SOURCES).entries()) {
      papp.all(`/p/${i}/:status`, () => make(Number(useRouteParams().get('status'))))
    }
    await papp.listen(0, '127.0.0.1')
    pbase = `http://127.0.0.1:${(papp.getServer()!.address() as { port: number }).port}`
  })
  afterAll(() => papp.close())

  for (const [i, source] of Object.keys(SOURCES).entries()) {
    for (const status of STATUSES) {
      for (const [condName, cond] of Object.entries(FAILING)) {
        it(`${source} ${status}, ${condName}`, async () => {
          const expected = status >= 200 && status <= 299 ? 412 : status
          for (const method of ['GET', 'HEAD']) {
            const path = `/p/${i}/${status}`
            const viaSocket = await fetch(`${pbase}${path}`, {
              method,
              headers: cond,
              redirect: 'manual',
            })
            await viaSocket.arrayBuffer()
            const viaFetch = (await papp.request(path, { method, headers: cond }))!
            expect(viaSocket.status, `${method} socket`).toBe(expected)
            expect(viaFetch.status, `${method} in-process`).toBe(expected)
          }
        })
      }
    }
  }
})
