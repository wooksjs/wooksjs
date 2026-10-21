import { Readable } from 'stream'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Wooks } from 'wooks'

import { headerValues, listenLocal, rawRequest } from '../../../../test-utils/raw-http'
import type { TRawResponse } from '../../../../test-utils/raw-http'
import { useRequest } from '../composables/request'
import { useResponse } from '../composables/response'
import { HttpError } from '../errors'
import { createHttpApp } from '../http-adapter'
import type { WooksHttp } from '../http-adapter'
import { prerenderJson } from './prerender'
import { WooksHttpResponse } from './wooks-http-response'

/*
 * Review R4-M1 — ONE header line per header name, on every write path, whatever casing the
 * handler (or a returned fetch Response) used; and Content-Length always equals the bytes
 * actually sent (HEAD: what GET sends, or absent).
 * Generated over body kind × method × header-name casing × several header names, read off a
 * RAW socket (fetch would join duplicates).
 */

const NAMES = ['Content-Type', 'Cache-Control', 'X-Custom', 'Vary', 'ETag']
const CASINGS: Array<(n: string) => string> = [
  (n) => n.toLowerCase(),
  (n) => n,
  (n) => n.toUpperCase(),
]

/** Sets every header name twice, in two casings, then once more through setHeaders(). */
function setHeadersMixed(casingA: number, casingB: number) {
  const response = useResponse()
  for (const name of NAMES) {
    const value = name === 'Content-Type' ? 'text/plain' : name === 'ETag' ? '"v1"' : `${name}-a`
    response.setHeader(CASINGS[casingA](name), value)
    response.setHeader(
      CASINGS[casingB](name),
      name === 'Content-Type' || name === 'ETag' ? value : `${name}-b`,
    )
  }
  response.setHeaders({ [CASINGS[(casingA + 1) % 3]('X-Custom')]: 'final' })
}

const doc = prerenderJson({ big: 'payload'.repeat(50) }, { etag: true })
const KINDS: Record<string, () => unknown> = {
  text: () => 'hello world '.repeat(40),
  json: () => ({ a: 'x'.repeat(300) }),
  prerendered: () => doc,
  stream: () => {
    const data = Buffer.from('stream-body!')
    useResponse().setHeader('Content-Length', data.length).setHeader('content-length', data.length)
    return useRequest().method === 'HEAD' ? '' : Readable.from([data])
  },
  'fetch Response': () => {
    useResponse().setHeader('Content-Length', '3') // conflicts with the Response's own length
    return new Response('abcdef', {
      headers: { 'Content-Type': 'text/plain', 'X-Custom': 'from-response', 'content-length': '6' },
    })
  },
}

let plain: WooksHttp
let compressed: WooksHttp
const ports: Record<string, number> = {}

beforeAll(async () => {
  plain = createHttpApp(undefined, new Wooks())
  compressed = createHttpApp({ compression: { threshold: 1 } }, new Wooks())
  for (const app of [plain, compressed]) {
    for (const [k, make] of Object.values(KINDS).entries()) {
      for (let a = 0; a < 3; a++) {
        for (let b = 0; b < 3; b++) {
          app.all(`/k${k}/${a}${b}`, () => {
            setHeadersMixed(a, b)
            return make()
          })
        }
      }
    }
  }
  ports.plain = await listenLocal(plain)
  ports.compressed = await listenLocal(compressed)
})
afterAll(() => Promise.all([plain.close(), compressed.close()]))

function duplicates(res: TRawResponse): string[] {
  const seen = new Map<string, number>()
  for (const [k] of res.headers) {
    const lower = k.toLowerCase()
    if (lower !== 'set-cookie') {
      seen.set(lower, (seen.get(lower) ?? 0) + 1)
    }
  }
  return [...seen].filter(([, n]) => n > 1).map(([k]) => k)
}

describe('one header line per name, Content-Length = bytes sent', () => {
  for (const app of ['plain', 'compressed'] as const) {
    for (const [k, kind] of Object.keys(KINDS).entries()) {
      it(`${app} / ${kind}`, async () => {
        const problems: string[] = []
        for (let a = 0; a < 3; a++) {
          for (let b = 0; b < 3; b++) {
            const path = `/k${k}/${a}${b}`
            const get = await rawRequest(ports[app], 'GET', path, { 'Accept-Encoding': 'gzip' })
            const head = await rawRequest(ports[app], 'HEAD', path, { 'Accept-Encoding': 'gzip' })
            for (const [m, res] of [
              ['GET', get],
              ['HEAD', head],
            ] as const) {
              const dup = duplicates(res)
              if (dup.length) {
                problems.push(`${m} ${path}: duplicated ${dup.join(', ')}`)
              }
            }
            const getLen = headerValues(get, 'content-length')[0]
            if (getLen !== undefined && Number(getLen) !== get.body.length) {
              problems.push(
                `GET ${path}: Content-Length ${getLen} but ${get.body.length} bytes sent`,
              )
            }
            const headLen = headerValues(head, 'content-length')[0]
            if (headLen !== undefined && Number(headLen) !== get.body.length) {
              problems.push(
                `HEAD ${path}: Content-Length ${headLen} but GET sends ${get.body.length}`,
              )
            }
          }
        }
        expect(problems.slice(0, 10), `${problems.length} problems`).toEqual([])
      })
    }
  }
})

/*
 * A subclass's `renderError` may write header names in any casing: the error response still
 * carries one line per name — on every error path (thrown, returned, the router's 404, the
 * automatic 412), socket and in-process.
 */
describe('a custom renderError writing mixed-case names', () => {
  class ShoutingResponse extends WooksHttpResponse {
    protected renderError(data: Parameters<WooksHttpResponse['renderError']>[0]): void {
      this._status = data.statusCode
      this._headers['Content-Type'] = 'text/plain'
      this._headers['CACHE-CONTROL'] = 'private, max-age=5'
      this._headers['X-Custom'] = 'from-renderer'
      this._body = `${data.statusCode} ${data.message}`
    }
  }
  let rapp: WooksHttp
  let port: number
  const SOURCES: Record<string, { path: string; headers?: Record<string, string> }> = {
    thrown: { path: '/thrown' },
    returned: { path: '/returned' },
    'router 404': { path: '/missing' },
    'automatic 412': { path: '/ok', headers: { 'If-Match': '"stale"' } },
  }
  beforeAll(async () => {
    rapp = createHttpApp({ responseClass: ShoutingResponse }, new Wooks())
    const before = () =>
      useResponse().setHeader('x-custom', 'from-handler').setHeader('etag', '"v1"')
    rapp.all('/thrown', () => {
      before()
      throw new HttpError(409, 'conflict')
    })
    rapp.all('/returned', () => {
      before()
      return new HttpError(422, 'invalid')
    })
    rapp.all('/ok', () => {
      before()
      return 'fine'
    })
    port = await listenLocal(rapp)
  })
  afterAll(() => rapp.close())

  for (const [name, { path, headers }] of Object.entries(SOURCES)) {
    for (const method of ['GET', 'HEAD']) {
      it(`${name}, ${method}`, async () => {
        const viaSocket = await rawRequest(port, method, path, headers)
        expect(duplicates(viaSocket), 'socket').toEqual([])
        expect(headerValues(viaSocket, 'cache-control')).toEqual(['private, max-age=5'])
        expect(headerValues(viaSocket, 'x-custom')).toEqual(['from-renderer'])
        const viaFetch = await rapp.request(path, { method, headers })
        if (viaFetch) {
          expect(viaFetch.headers.get('cache-control'), 'in-process').toBe('private, max-age=5')
          expect(viaFetch.headers.get('x-custom'), 'in-process').toBe('from-renderer')
        }
      })
    }
  }
})
