import { Readable } from 'stream'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Wooks } from 'wooks'

import { headerValues, listenLocal, rawRequest } from '../../../../test-utils/raw-http'
import { useRequest } from '../composables/request'
import { useResponse } from '../composables/response'
import { createHttpApp } from '../http-adapter'
import type { WooksHttp } from '../http-adapter'
import { prerenderJson } from './prerender'

/*
 * Review R3-L3 — a HEAD response carries the same headers a GET would (RFC 9110 §9.3.2),
 * Content-Length included: a handler that sets Content-Length itself and skips the body on HEAD
 * (as `serveFile` does) keeps it; otherwise the length of the body the GET would send applies.
 * Generated over body kinds × send path (socket, in-process fetch).
 */

const doc = prerenderJson({ big: 'payload' }, { etag: true })

const BODIES: Record<string, (head: boolean) => unknown> = {
  text: () => 'hello',
  json: () => ({ a: 1, b: 'two' }),
  buffer: () => Buffer.from('bytes!'),
  prerendered: () => doc,
  'explicit length, no HEAD body': (head) => {
    useResponse().setHeader('content-length', 11).setHeader('content-type', 'text/plain')
    return head ? '' : 'hello world'
  },
  'explicit length (mixed case), no HEAD body': (head) => {
    useResponse().setHeader('Content-Length', 11).setHeader('content-type', 'text/plain')
    return head ? '' : 'hello world'
  },
  'explicit length, stream': (head) => {
    useResponse().setHeader('content-length', 11).setHeader('content-type', 'text/plain')
    return head ? '' : Readable.from([Buffer.from('hello world')])
  },
}

let app: WooksHttp
let base: string

beforeAll(async () => {
  app = createHttpApp(undefined, new Wooks())
  for (const [i, make] of Object.values(BODIES).entries()) {
    app.all(`/b/${i}`, () => make(useRequest().method === 'HEAD'))
  }
  base = `http://127.0.0.1:${await listenLocal(app)}`
})
afterAll(() => app.close())

const pick = (r: Response) => ({
  status: r.status,
  length: r.headers.get('content-length'),
  type: r.headers.get('content-type'),
  etag: r.headers.get('etag'),
})

describe('HEAD headers equal GET headers', () => {
  for (const [i, name] of Object.keys(BODIES).entries()) {
    it(name, async () => {
      const path = `/b/${i}`
      const getSocket = await fetch(`${base}${path}`)
      const getBody = await getSocket.arrayBuffer()
      const headSocket = await fetch(`${base}${path}`, { method: 'HEAD' })
      const getFetch = (await app.request(path))!
      const headFetch = (await app.request(path, { method: 'HEAD' }))!
      expect(pick(getSocket).length).toBe(String(getBody.byteLength))
      expect(pick(headSocket), 'socket').toEqual(pick(getSocket))
      expect(pick(getFetch), 'in-process GET').toEqual(pick(getSocket))
      expect(pick(headFetch), 'in-process HEAD').toEqual(pick(getSocket))
      expect((await headSocket.arrayBuffer()).byteLength).toBe(0)
      expect(await headFetch.text()).toBe('')
    })
  }
})

/*
 * Review R4-L5 — with response compression on, HEAD negotiates exactly as GET does: same
 * Content-Encoding, Vary and ETag; Content-Length absent or exactly GET's (never the identity
 * size next to a compressed encoding). Read off a raw socket.
 */
describe('HEAD on a compressed GET', () => {
  let capp: WooksHttp
  let port: number
  const KINDS: Record<string, () => unknown> = {
    text: () => 'compress me '.repeat(100),
    json: () => ({ data: 'x'.repeat(2000) }),
    prerendered: () => doc,
    'explicit length (wrong)': () => {
      useResponse().setHeader('Content-Length', 5)
      return 'hello world '.repeat(50)
    },
    stream: () => {
      useResponse().setHeader('content-length', 11)
      return useRequest().method === 'HEAD' ? '' : Readable.from([Buffer.from('hello world')])
    },
    'fetch Response': () =>
      new Response('abcdef'.repeat(100), { headers: { 'content-type': 'text/plain' } }),
  }
  beforeAll(async () => {
    capp = createHttpApp({ compression: { threshold: 1 } }, new Wooks())
    for (const [i, make] of Object.values(KINDS).entries()) {
      capp.all(`/c/${i}`, make)
    }
    port = await listenLocal(capp)
  })
  afterAll(() => capp.close())

  for (const [i, name] of Object.keys(KINDS).entries()) {
    for (const accept of ['gzip', 'br', 'identity', undefined]) {
      it(`${name}, Accept-Encoding: ${accept ?? '(none)'}`, async () => {
        const headers: Record<string, string> = accept ? { 'Accept-Encoding': accept } : {}
        const get = await rawRequest(port, 'GET', `/c/${i}`, headers)
        const head = await rawRequest(port, 'HEAD', `/c/${i}`, headers)
        for (const h of ['content-encoding', 'vary', 'etag', 'content-type']) {
          expect(headerValues(head, h), h).toEqual(headerValues(get, h))
        }
        const headLen = headerValues(head, 'content-length')
        if (headLen.length) {
          expect(Number(headLen[0])).toBe(get.body.length)
        }
        expect(head.body.length).toBe(0)
      })
    }
  }
})

/*
 * Simplify review (altitude) — a 304 carries the validators the 200 it confirms would carry
 * (RFC 9110 §15.4.5): with compression on, the weakened ETag of the encoded response, not the
 * strong one. Generated over body kind × Accept-Encoding × method × condition, read off a raw
 * socket: the 304's ETag / Last-Modified / Vary / Cache-Control equal the 200's exactly.
 */
describe('304 carries the validators of the response it confirms', () => {
  let vapp: WooksHttp
  let port: number
  const LM = 'Wed, 21 Oct 2026 10:00:00 GMT'
  const strongDoc = prerenderJson({ big: 'payload'.repeat(50) }, { etag: '"doc-1"' })
  const KINDS: Record<string, () => unknown> = {
    'explicit strong etag': () => {
      useResponse()
        .setHeader('etag', '"v1"')
        .setHeader('last-modified', LM)
        .setCacheControl({ public: true, maxAge: 60 })
      return 'compress me '.repeat(100)
    },
    'explicit weak etag': () => {
      useResponse().setHeader('etag', 'W/"v1"').setHeader('last-modified', LM)
      return 'compress me '.repeat(100)
    },
    'prerendered, strong tag': () => strongDoc,
    'prerendered, computed tag': () => doc,
    'last-modified only': () => {
      useResponse().setHeader('last-modified', LM)
      return { data: 'x'.repeat(2000) }
    },
    'too small to compress': () => {
      useResponse().setHeader('etag', '"tiny"')
      return 'hi'
    },
  }
  const VALIDATORS = ['etag', 'last-modified', 'vary', 'cache-control']

  beforeAll(async () => {
    vapp = createHttpApp({ compression: { threshold: 100 } }, new Wooks())
    for (const [i, make] of Object.values(KINDS).entries()) {
      vapp.all(`/v/${i}`, make)
    }
    port = await listenLocal(vapp)
  })
  afterAll(() => vapp.close())

  for (const [i, name] of Object.keys(KINDS).entries()) {
    for (const accept of ['gzip', 'br', 'gzip;q=0', 'identity', undefined]) {
      for (const method of ['GET', 'HEAD']) {
        it(`${name}, ${method}, Accept-Encoding: ${accept ?? '(none)'}`, async () => {
          const base: Record<string, string> = accept ? { 'Accept-Encoding': accept } : {}
          const full = await rawRequest(port, method, `/v/${i}`, base)
          expect(full.status).toBe(200)
          const etag = headerValues(full, 'etag')[0]
          const conditions: Array<Record<string, string>> = [{ 'If-Modified-Since': LM }]
          if (etag) {
            conditions.push({ 'If-None-Match': etag })
          }
          for (const cond of conditions) {
            const res = await rawRequest(port, method, `/v/${i}`, { ...base, ...cond })
            const lm = headerValues(full, 'last-modified').length > 0
            if (!('If-None-Match' in cond) && !lm) {
              continue
            }
            expect(res.status, JSON.stringify(cond)).toBe(304)
            for (const h of VALIDATORS) {
              expect(headerValues(res, h), `${h} ${JSON.stringify(cond)}`).toEqual(
                headerValues(full, h),
              )
            }
          }
        })
      }
    }
  }
})
