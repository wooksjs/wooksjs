import { createServer, request as httpRequest } from 'http'
import type { IncomingHttpHeaders, Server } from 'http'
import type { AddressInfo } from 'net'
import { Readable } from 'stream'
import { brotliDecompressSync, gunzipSync } from 'zlib'
import type * as zlibModule from 'node:zlib'
import { useRouteParams } from '@wooksjs/event-core'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Wooks } from 'wooks'

import { useResponse } from '../composables/response'
import { HttpError } from '../errors'
import { createHttpApp } from '../http-adapter'
import type { TWooksHttpOptions } from '../http-adapter'
import { HttpResponse } from './http-response'
import { isCompressibleType, negotiateEncoding } from './compression'
import { getPrerenderedJson, prerenderJson } from './prerender'

// Counts compressor calls and lets a test force a failure (brotli quality 7 → error)
const zlibCalls = vi.hoisted(() => ({ br: 0, gzip: 0 }))
vi.mock('node:zlib', async (importOriginal) => {
  const zlib = await importOriginal<typeof zlibModule>()
  return {
    ...zlib,
    brotliCompress: (buf: any, opts: any, cb: any) => {
      zlibCalls.br++
      if (opts?.params?.[zlib.constants.BROTLI_PARAM_QUALITY] === 7) {
        setImmediate(() => cb(new Error('boom')))
        return
      }
      zlib.brotliCompress(buf, opts, cb)
    },
    gzip: (buf: any, opts: any, cb: any) => {
      zlibCalls.gzip++
      zlib.gzip(buf, opts, cb)
    },
  }
})

const logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {}, log: () => {} }

const rows = Array.from({ length: 200 }, (_, i) => ({
  id: i,
  title: `Task number ${i}`,
  done: !!(i % 2),
}))
const big = { rows }
const bigJson = JSON.stringify(big)
const meta = prerenderJson(Object.freeze({ rows: rows.map((r) => ({ ...r, meta: true })) }), {
  etag: true,
})
const metaJson = JSON.stringify(meta)
const metaNoEtag = prerenderJson(Object.freeze({ list: rows.map((r) => r.title) }))

interface TRawResponse {
  status: number
  headers: IncomingHttpHeaders
  body: Buffer
}

function decode(res: TRawResponse): string {
  const enc = res.headers['content-encoding']
  if (enc === 'br') {
    return brotliDecompressSync(res.body).toString()
  }
  if (enc === 'gzip') {
    return gunzipSync(res.body).toString()
  }
  return res.body.toString()
}

function routes(app: ReturnType<typeof createHttpApp>) {
  app.get('/big', () => big)
  app.get('/big-async', async () => big)
  app.post('/big', () => big)
  app.head('/big', () => big)
  app.get('/text', () => 'x'.repeat(5000))
  app.get('/len/:n', () => 'a'.repeat(Number(useRouteParams().params.n)))
  app.get('/multibyte/:n', () => 'é'.repeat(Number(useRouteParams().params.n)))
  app.get('/html', () => {
    useResponse().setContentType('text/html; charset=utf-8')
    return `<html>${'<p>hello</p>'.repeat(200)}</html>`
  })
  app.get('/problem', () => {
    useResponse().setContentType('application/problem+json')
    return bigJson
  })
  app.get('/sse', () => {
    useResponse().setContentType('text/event-stream')
    return 'data: x\n\n'.repeat(500)
  })
  app.get('/png', () => {
    useResponse().setContentType('image/png')
    return new Uint8Array(4000)
  })
  app.get('/octet', () => new Uint8Array(4000))
  app.get('/vary-origin', () => {
    useResponse().setHeader('Vary', 'Origin')
    return big
  })
  app.get('/vary-has', () => {
    useResponse().setHeader('vary', 'accept-encoding')
    return big
  })
  app.get('/vary-star', () => {
    useResponse().setHeader('Vary', '*')
    return big
  })
  app.get('/pre-encoded', () => {
    useResponse().setHeader('Content-Encoding', 'identity').setContentType('application/json')
    return bigJson
  })
  app.get('/no-transform', () => {
    useResponse().setHeader('Cache-Control', 'public, no-transform')
    return big
  })
  app.get('/opt-out', () => {
    useResponse().setCompression(false)
    return big
  })
  app.get('/opt-in', () => {
    useResponse().setCompression(true)
    return big
  })
  app.get('/opt-small', () => {
    useResponse().setCompression({ threshold: 10, encodings: ['gzip'] })
    return 'small but compressed'
  })
  app.get('/no-content', () => undefined)
  app.get('/status-304', () => {
    useResponse().setStatus(304)
    return big
  })
  app.get('/stream', () => Readable.from([Buffer.from(bigJson)]))
  app.get(
    '/fetch-response',
    () => new Response(bigJson, { headers: { 'content-type': 'application/json' } }),
  )
  app.get('/error', () => {
    throw new HttpError(400, `Invalid input: ${'bad '.repeat(400)}`)
  })
  app.get('/strong-etag', () => {
    useResponse().setHeader('ETag', '"v1"')
    return big
  })
  app.get('/explicit-length', () => {
    useResponse().setHeader('Content-Length', String(Buffer.byteLength(bigJson)))
    return big
  })
  app.get('/cookie', () => {
    useResponse().setCookie('session', 'abc', { httpOnly: true })
    return big
  })
  app.get('/meta', () => {
    useResponse().setHeader('vary', 'Authorization')
    return meta
  })
  app.get('/meta-plain', () => metaNoEtag)
  app.get('/meta-fail', () => {
    useResponse().setCompression({ brotliQuality: 7 })
    return metaNoEtag
  })
  app.get('/fail', () => {
    useResponse().setCompression({ brotliQuality: 7 })
    return big
  })
}

async function startServer(opts: TWooksHttpOptions) {
  const app = createHttpApp(
    { logger: logger as any, ...opts },
    new Wooks({ logger: logger as any }),
  )
  routes(app)
  const server = createServer(app.getServerCb() as any)
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const port = (server.address() as AddressInfo).port
  const get = (path: string, headers: Record<string, string> = {}, method = 'GET') =>
    new Promise<TRawResponse>((resolve, reject) => {
      const req = httpRequest({ host: '127.0.0.1', port, path, method, headers }, (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () =>
          resolve({ status: res.statusCode!, headers: res.headers, body: Buffer.concat(chunks) }),
        )
        res.on('error', reject)
      })
      req.on('error', reject)
      req.end()
    })
  return { app, server, get }
}

describe('negotiateEncoding', () => {
  const supported = ['br', 'gzip'] as const
  it.each([
    [undefined, undefined],
    ['', undefined],
    ['gzip, deflate, br', 'br'],
    ['gzip, deflate, br, zstd', 'br'],
    ['gzip', 'gzip'],
    ['deflate', undefined],
    ['identity', undefined],
    ['br;q=0.5, gzip', 'gzip'],
    ['br;q=1.0, gzip;q=1', 'br'],
    ['gzip;q=0.9, br;q=0.8', 'gzip'],
    ['br;q=0, gzip;q=0', undefined],
    ['br;q=0', undefined],
    ['*', 'br'],
    ['*;q=0.5, gzip;q=0.6', 'gzip'],
    ['*;q=0, gzip', 'gzip'],
    ['*;q=0, identity', undefined],
    ['identity;q=0', undefined],
    ['BR, GZIP', 'br'],
    [' gzip ; q=0.5 , br ; q=0.4 ', 'gzip'],
    ['br;q=abc, gzip;q=0.1', 'gzip'],
    [['gzip', 'br'], 'br'],
  ])('%j → %s', (header, expected) => {
    expect(negotiateEncoding(header as any, supported)).toBe(expected)
  })

  it('respects the configured order and set', () => {
    expect(negotiateEncoding('gzip, br', ['gzip', 'br'])).toBe('gzip')
    expect(negotiateEncoding('br', ['gzip'])).toBeUndefined()
  })
})

describe('isCompressibleType', () => {
  it.each([
    ['application/json', true],
    ['application/json; charset=utf-8', true],
    ['application/problem+json', true],
    ['application/vnd.api+json', true],
    ['text/plain', true],
    ['text/html; charset=utf-8', true],
    ['text/css', true],
    ['application/javascript', true],
    ['image/svg+xml', true],
    ['application/xml', true],
    ['application/atom+xml', true],
    ['text/event-stream', false],
    ['image/png', false],
    ['application/octet-stream', false],
    ['application/zip', false],
    ['video/mp4', false],
    ['application/jsonp', false],
  ])('%s → %s', (type, expected) => {
    expect(isCompressibleType(type)).toBe(expected)
  })
})

describe('response compression (off by default)', () => {
  let ctx: Awaited<ReturnType<typeof startServer>>
  beforeAll(async () => {
    ctx = await startServer({})
  })
  afterAll(() => new Promise((r) => ctx.server.close(r)))

  it('sends identity without Vary when the option is not set', async () => {
    const res = await ctx.get('/big', { 'accept-encoding': 'br, gzip' })
    expect(res.headers['content-encoding']).toBeUndefined()
    expect(res.headers.vary).toBeUndefined()
    expect(res.body.toString()).toBe(bigJson)
  })

  it('a per-response setCompression(true) enables it with the defaults', async () => {
    const res = await ctx.get('/opt-in', { 'accept-encoding': 'gzip, br' })
    expect(res.headers['content-encoding']).toBe('br')
    expect(res.headers.vary).toBe('Accept-Encoding')
    expect(decode(res)).toBe(bigJson)
  })

  it('a per-response options object enables it with those settings', async () => {
    const res = await ctx.get('/opt-small', { 'accept-encoding': 'gzip, br' })
    expect(res.headers['content-encoding']).toBe('gzip')
    expect(decode(res)).toBe('small but compressed')
  })
})

describe('response compression (enabled)', () => {
  let ctx: Awaited<ReturnType<typeof startServer>>
  beforeAll(async () => {
    ctx = await startServer({ compression: true })
  })
  afterAll(() => new Promise((r) => ctx.server.close(r)))
  beforeEach(() => {
    zlibCalls.br = 0
    zlibCalls.gzip = 0
  })

  it.each([
    ['gzip, deflate, br', 'br'],
    ['gzip', 'gzip'],
    ['br;q=0.1, gzip;q=0.9', 'gzip'],
    ['*', 'br'],
    ['*;q=0, gzip', 'gzip'],
    ['identity', undefined],
    ['br;q=0, gzip;q=0', undefined],
    ['deflate', undefined],
  ])('Accept-Encoding %j → %s (+ Vary, round-trips)', async (accept, expected) => {
    const res = await ctx.get('/big', { 'accept-encoding': accept })
    expect(res.status).toBe(200)
    expect(res.headers['content-encoding']).toBe(expected)
    expect(res.headers.vary).toBe('Accept-Encoding')
    expect(Number(res.headers['content-length'])).toBe(res.body.byteLength)
    expect(decode(res)).toBe(bigJson)
    if (expected) {
      expect(res.body.byteLength).toBeLessThan(Buffer.byteLength(bigJson) / 3)
    }
  })

  it('no Accept-Encoding header → identity, still Vary', async () => {
    const res = await ctx.get('/big')
    expect(res.headers['content-encoding']).toBeUndefined()
    expect(res.headers.vary).toBe('Accept-Encoding')
    expect(res.body.toString()).toBe(bigJson)
  })

  it('async handlers and non-GET statuses are compressed', async () => {
    const a = await ctx.get('/big-async', { 'accept-encoding': 'gzip' })
    expect(a.headers['content-encoding']).toBe('gzip')
    expect(decode(a)).toBe(bigJson)
    const p = await ctx.get('/big', { 'accept-encoding': 'br' }, 'POST')
    expect(p.status).toBe(201)
    expect(p.headers['content-encoding']).toBe('br')
    expect(decode(p)).toBe(bigJson)
  })

  it('threshold: 1023 bytes stays identity, 1024 bytes is compressed', async () => {
    const below = await ctx.get('/len/1023', { 'accept-encoding': 'br' })
    expect(below.headers['content-encoding']).toBeUndefined()
    expect(below.headers.vary).toBeUndefined()
    expect(below.body.byteLength).toBe(1023)
    const at = await ctx.get('/len/1024', { 'accept-encoding': 'br' })
    expect(at.headers['content-encoding']).toBe('br')
    expect(decode(at)).toBe('a'.repeat(1024))
  })

  it('threshold counts UTF-8 bytes, not characters', async () => {
    const below = await ctx.get('/multibyte/511', { 'accept-encoding': 'br' }) // 1022 bytes
    expect(below.headers['content-encoding']).toBeUndefined()
    const above = await ctx.get('/multibyte/600', { 'accept-encoding': 'br' }) // 1200 bytes
    expect(above.headers['content-encoding']).toBe('br')
    expect(decode(above)).toBe('é'.repeat(600))
  })

  it('compresses text, html and +json content types', async () => {
    for (const path of ['/text', '/html', '/problem']) {
      const res = await ctx.get(path, { 'accept-encoding': 'gzip' })
      expect(res.headers['content-encoding'], path).toBe('gzip')
      expect(Number(res.headers['content-length'])).toBe(res.body.byteLength)
    }
    expect(decode(await ctx.get('/problem', { 'accept-encoding': 'br' }))).toBe(bigJson)
  })

  it('skips non-compressible types and SSE', async () => {
    for (const path of ['/png', '/octet', '/sse']) {
      const res = await ctx.get(path, { 'accept-encoding': 'br, gzip' })
      expect(res.headers['content-encoding'], path).toBeUndefined()
      expect(res.headers.vary, path).toBeUndefined()
    }
  })

  it('merges Accept-Encoding into an existing Vary', async () => {
    const res = await ctx.get('/vary-origin', { 'accept-encoding': 'br' })
    expect(res.headers.vary).toBe('Origin, Accept-Encoding')
    expect(res.headers['content-encoding']).toBe('br')
    const has = await ctx.get('/vary-has', { 'accept-encoding': 'br' })
    expect(has.headers.vary).toBe('accept-encoding')
    const star = await ctx.get('/vary-star', { 'accept-encoding': 'br' })
    expect(star.headers.vary).toBe('*')
  })

  it('never re-encodes a body with Content-Encoding already set', async () => {
    const res = await ctx.get('/pre-encoded', { 'accept-encoding': 'br' })
    expect(res.headers['content-encoding']).toBe('identity')
    expect(res.body.toString()).toBe(bigJson)
  })

  it('honours Cache-Control: no-transform', async () => {
    const res = await ctx.get('/no-transform', { 'accept-encoding': 'br' })
    expect(res.headers['content-encoding']).toBeUndefined()
    expect(res.headers.vary).toBeUndefined()
  })

  it('setCompression(false) opts a response out', async () => {
    const res = await ctx.get('/opt-out', { 'accept-encoding': 'br' })
    expect(res.headers['content-encoding']).toBeUndefined()
    expect(res.headers.vary).toBeUndefined()
    expect(res.body.toString()).toBe(bigJson)
  })

  it('HEAD: identity Content-Length, no body, Vary kept', async () => {
    const res = await ctx.get('/big', { 'accept-encoding': 'br' }, 'HEAD')
    expect(res.status).toBe(200)
    expect(res.headers['content-encoding']).toBeUndefined()
    expect(res.headers['content-length']).toBe(String(Buffer.byteLength(bigJson)))
    expect(res.headers.vary).toBe('Accept-Encoding')
    expect(res.body.byteLength).toBe(0)
    expect(zlibCalls.br).toBe(0)
  })

  it('204 and an explicit 304 are not compressed', async () => {
    const n = await ctx.get('/no-content', { 'accept-encoding': 'br' })
    expect(n.status).toBe(204)
    expect(n.headers['content-encoding']).toBeUndefined()
    const nm = await ctx.get('/status-304', { 'accept-encoding': 'br' })
    expect(nm.status).toBe(304)
    expect(nm.headers['content-encoding']).toBeUndefined()
    expect(zlibCalls.br).toBe(0)
  })

  it('streams and fetch Response bodies are sent untouched', async () => {
    for (const path of ['/stream', '/fetch-response']) {
      const res = await ctx.get(path, { 'accept-encoding': 'br, gzip' })
      expect(res.headers['content-encoding'], path).toBeUndefined()
      expect(res.headers.vary, path).toBeUndefined()
      expect(res.body.toString(), path).toBe(bigJson)
    }
    expect(zlibCalls.br + zlibCalls.gzip).toBe(0)
  })

  it('compresses qualifying error responses', async () => {
    const res = await ctx.get('/error', { 'accept-encoding': 'br', accept: 'application/json' })
    expect(res.status).toBe(400)
    expect(res.headers['content-encoding']).toBe('br')
    expect(res.headers['content-type']).toBe('application/json')
    const body = JSON.parse(decode(res))
    expect(body.statusCode).toBe(400)
    expect(body.message).toMatch(/^Invalid input: bad bad/)
    const html = await ctx.get('/error', { 'accept-encoding': 'gzip', accept: 'text/html' })
    expect(html.headers['content-encoding']).toBe('gzip')
    expect(decode(html)).toMatch(/<html/i)
  })

  it('weakens a strong ETag when compressing, keeps it otherwise', async () => {
    const c = await ctx.get('/strong-etag', { 'accept-encoding': 'br' })
    expect(c.headers.etag).toBe('W/"v1"')
    const i = await ctx.get('/strong-etag')
    expect(i.headers.etag).toBe('"v1"')
  })

  it('replaces an explicit Content-Length (any casing) with the compressed size', async () => {
    const res = await ctx.get('/explicit-length', { 'accept-encoding': 'br' })
    expect(res.headers['content-encoding']).toBe('br')
    expect(Number(res.headers['content-length'])).toBe(res.body.byteLength)
    expect(decode(res)).toBe(bigJson)
  })

  it('keeps Set-Cookie', async () => {
    const res = await ctx.get('/cookie', { 'accept-encoding': 'br' })
    expect(res.headers['content-encoding']).toBe('br')
    expect(res.headers['set-cookie']).toEqual(['session=abc; HttpOnly'])
  })

  it('a compressor failure falls back to identity', async () => {
    const res = await ctx.get('/fail', { 'accept-encoding': 'br' })
    expect(res.status).toBe(200)
    expect(res.headers['content-encoding']).toBeUndefined()
    expect(res.headers['content-length']).toBe(String(Buffer.byteLength(bigJson)))
    expect(res.body.toString()).toBe(bigJson)
  })

  it('programmatic fetch() is never compressed', async () => {
    const res = (await ctx.app.request('/big', { headers: { 'accept-encoding': 'br, gzip' } }))!
    expect(res.headers.get('content-encoding')).toBeNull()
    expect(res.headers.get('vary')).toBeNull()
    expect(await res.text()).toBe(bigJson)
    expect(zlibCalls.br + zlibCalls.gzip).toBe(0)
  })

  describe('prerendered bodies', () => {
    it('compresses once per coding and reuses the bytes (also for concurrent requests)', async () => {
      const results = await Promise.all(
        Array.from({ length: 5 }, () => ctx.get('/meta', { 'accept-encoding': 'br' })),
      )
      for (const res of results) {
        expect(res.headers['content-encoding']).toBe('br')
        expect(decode(res)).toBe(metaJson)
      }
      expect(zlibCalls.br).toBe(1)
      for (let i = 0; i < 5; i++) {
        const res = await ctx.get('/meta', { 'accept-encoding': 'br' })
        expect(decode(res)).toBe(metaJson)
        expect(Number(res.headers['content-length'])).toBe(res.body.byteLength)
      }
      expect(zlibCalls.br).toBe(1)
      await ctx.get('/meta', { 'accept-encoding': 'gzip' })
      await ctx.get('/meta', { 'accept-encoding': 'gzip' })
      expect(zlibCalls.gzip).toBe(1)
      expect(getPrerenderedJson(meta)!.size).toBe(Buffer.byteLength(metaJson))
      const cached = getPrerenderedJson(meta)!.compressed!
      expect(Object.keys(cached).toSorted()).toEqual(['br4', 'gzip6'])
      expect(Buffer.isBuffer(cached.br4)).toBe(true)
    })

    it('shares the weak ETag across codings; 304 keeps Vary', async () => {
      const br = await ctx.get('/meta', { 'accept-encoding': 'br' })
      const gz = await ctx.get('/meta', { 'accept-encoding': 'gzip' })
      const id = await ctx.get('/meta')
      expect(br.headers.etag).toMatch(/^W\//)
      expect(gz.headers.etag).toBe(br.headers.etag)
      expect(id.headers.etag).toBe(br.headers.etag)
      expect(br.headers.vary).toBe('Authorization, Accept-Encoding')
      const nm = await ctx.get('/meta', {
        'accept-encoding': 'br',
        'if-none-match': br.headers.etag!,
      })
      expect(nm.status).toBe(304)
      expect(nm.body.byteLength).toBe(0)
      expect(nm.headers['content-encoding']).toBeUndefined()
      expect(nm.headers.vary).toBe('Authorization, Accept-Encoding')
    })

    it('works without an ETag; a failed compression is not cached', async () => {
      const ok = await ctx.get('/meta-plain', { 'accept-encoding': 'br' })
      expect(ok.headers['content-encoding']).toBe('br')
      expect(ok.headers.etag).toBeUndefined()
      const fail = await ctx.get('/meta-fail', { 'accept-encoding': 'br' })
      expect(fail.headers['content-encoding']).toBeUndefined()
      expect(fail.body.toString()).toBe(JSON.stringify(metaNoEtag))
      expect(getPrerenderedJson(metaNoEtag)!.compressed!.br7).toBeUndefined()
    })
  })
})

describe('compression option resolution', () => {
  it('custom encodings, threshold and filter apply', async () => {
    const ctx = await startServer({
      compression: {
        encodings: ['gzip'],
        threshold: 4000,
        filter: (type) => type.startsWith('text/'),
      },
    })
    try {
      const json = await ctx.get('/big', { 'accept-encoding': 'br, gzip' })
      expect(json.headers['content-encoding']).toBeUndefined() // filter rejects JSON
      const text = await ctx.get('/text', { 'accept-encoding': 'br, gzip' })
      expect(text.headers['content-encoding']).toBe('gzip') // br not configured
      const small = await ctx.get('/len/3999', { 'accept-encoding': 'gzip' })
      expect(small.headers['content-encoding']).toBeUndefined()
    } finally {
      await new Promise((r) => ctx.server.close(r))
    }
  })

  it('a client that disconnects mid-compression is not written to (success and failure)', async () => {
    for (const quality of [4, 7]) {
      const writeHead = vi.fn()
      const res = { writable: true, writableEnded: false, destroyed: false, writeHead } as any
      const req = { method: 'GET', headers: { 'accept-encoding': 'br' } } as any
      const response = new HttpResponse(res, req, logger as any, undefined, false)
      response.setCompression({ brotliQuality: quality }) // 7 → mocked compressor failure
      response.body = big
      const sent = response.send()
      expect(sent).toBeInstanceOf(Promise)
      res.destroyed = true // the socket closes while the body is being compressed
      await sent
      expect(writeHead, `quality ${quality}`).not.toHaveBeenCalled()
    }
  })

  it('exposes the effective settings on the response', () => {
    const app = createHttpApp(
      { logger: logger as any, compression: { gzipLevel: 1 } },
      new Wooks({ logger: logger as any }),
    )
    let seen: unknown
    app.get('/x', () => {
      const r = useResponse()
      seen = r.compression
      r.setCompression({ threshold: 5 })
      expect(r.compression).toMatchObject({ threshold: 5, gzipLevel: 1, brotliQuality: 4 })
      r.setCompression(false)
      expect(r.compression).toBe(false)
      return 'ok'
    })
    const res = {
      writable: true,
      writableEnded: false,
      writeHead: () => res,
      end: () => res,
    } as any
    const req = Object.assign(Readable.from([]), { method: 'GET', url: '/x', headers: {} })
    app.getServerCb()(req as any, res)
    expect(seen).toMatchObject({
      threshold: 1024,
      encodings: ['br', 'gzip'],
      gzipLevel: 1,
      brotliQuality: 4,
    })
  })
})
