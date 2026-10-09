import { EventContext, run } from '@wooksjs/event-core'
import { Buffer } from 'buffer'
import type { IncomingMessage } from 'http'
import { PassThrough } from 'stream'
import { gunzipSync, gzipSync } from 'zlib'
import { afterEach, describe, expect, it } from 'vitest'

import { compressors } from '../../compressor'
import { HttpError } from '../../errors'
import { httpKind } from '../../http-kind'
import type { TRequestLimits } from '../../types'
import { useRequest } from '../request'

function makeReq(headers: Record<string, string> = {}) {
  const req = new PassThrough() as PassThrough & Partial<IncomingMessage>
  req.headers = headers
  req.method = 'POST'
  req.url = '/'
  return req
}

function readBody(req: PassThrough, requestLimits?: TRequestLimits): Promise<Buffer> {
  const ctx = new EventContext({ logger: console as any })
  ctx.seed(httpKind, { req: req as unknown as IncomingMessage, response: undefined, requestLimits })
  return run(ctx, () => useRequest().rawBody())
}

async function expectHttpError(p: Promise<unknown>, status: number, message: string) {
  const error = await p.then(
    () => undefined,
    (error: unknown) => error,
  )
  expect(error).toBeInstanceOf(HttpError)
  expect((error as HttpError).code).toBe(status)
  expect((error as HttpError).body.message).toBe(message)
}

const tick = () => new Promise((r) => setTimeout(r, 5))

describe('rawBody reader', () => {
  it('reads a single-chunk body and destroys the request once done', async () => {
    const req = makeReq()
    const p = readBody(req)
    req.end('{"a":1}')
    const body = await p
    expect(body.toString()).toBe('{"a":1}')
    expect(req.destroyed).toBe(true)
  })

  it('removes its stream listeners once settled (success and failure)', async () => {
    const events = ['data', 'end', 'error', 'close'] as const
    const ok = makeReq()
    const before = events.map((e) => ok.listenerCount(e))
    const p = readBody(ok)
    ok.end('x')
    await p
    expect(events.map((e) => ok.listenerCount(e))).toEqual(before)

    const tooBig = makeReq()
    const p2 = readBody(tooBig, { maxInflated: 1 })
    tooBig.write('xx')
    await expectHttpError(p2, 413, 'Payload Too Large')
    expect(events.map((e) => tooBig.listenerCount(e))).toEqual(before)
  })

  it('concatenates a multi-chunk body', async () => {
    const req = makeReq()
    const p = readBody(req)
    req.write('hello ')
    await tick()
    req.write('big ')
    await tick()
    req.end('world')
    expect((await p).toString()).toBe('hello big world')
  })

  it('resolves an empty buffer for an empty body', async () => {
    const req = makeReq()
    const p = readBody(req)
    req.end()
    const body = await p
    expect(Buffer.isBuffer(body)).toBe(true)
    expect(body.length).toBe(0)
  })

  it('fails fast with 413 on an oversized Content-Length', async () => {
    const req = makeReq({ 'content-length': '2000' })
    await expectHttpError(readBody(req, { maxInflated: 1000 }), 413, 'Payload Too Large')
  })

  it('fails with 415 on an unsupported Content-Encoding', async () => {
    const req = makeReq({ 'content-encoding': 'zstd-x' })
    await expectHttpError(readBody(req), 415, 'Unsupported Content-Encoding "zstd-x"')
  })

  it('fails with 413 when a body without Content-Length exceeds the limit', async () => {
    const req = makeReq()
    const p = readBody(req, { maxInflated: 10 })
    req.write('12345')
    req.write('678901')
    await expectHttpError(p, 413, 'Payload Too Large')
    expect(req.destroyed).toBe(true)
  })

  it('fails with 408 when the body stalls past readTimeoutMs', async () => {
    const req = makeReq()
    const p = readBody(req, { readTimeoutMs: 30 })
    req.write('partial')
    await expectHttpError(p, 408, 'Request body timeout')
    expect(req.destroyed).toBe(true)
  })

  it('refreshes the read timeout on every chunk', async () => {
    const req = makeReq()
    const p = readBody(req, { readTimeoutMs: 40 })
    for (let i = 0; i < 4; i++) {
      req.write('x')
      await new Promise((r) => setTimeout(r, 20))
    }
    req.end('y')
    expect((await p).toString()).toBe('xxxxy')
  })

  it('fails with 408 on a premature close', async () => {
    const req = makeReq()
    const p = readBody(req)
    req.write('partial')
    await tick()
    req.destroy()
    await expectHttpError(p, 408, 'Request body timeout')
  })

  it('fails with 408 on a stream error', async () => {
    const req = makeReq()
    const p = readBody(req)
    req.write('partial')
    await tick()
    req.destroy(new Error('boom'))
    await expectHttpError(p, 408, 'Request body timeout')
  })

  it('decompresses a gzip body (streaming)', async () => {
    const req = makeReq({ 'content-encoding': 'gzip' })
    const p = readBody(req)
    req.end(gzipSync(Buffer.from('compressed payload')))
    expect((await p).toString()).toBe('compressed payload')
  })

  it('fails with 413 when the inflated gzip body exceeds maxInflated', async () => {
    const req = makeReq({ 'content-encoding': 'gzip' })
    const p = readBody(req, { maxInflated: 100, maxRatio: 1000 })
    req.end(gzipSync(Buffer.alloc(1000, 'a')))
    await expectHttpError(p, 413, 'Inflated body too large')
  })

  it('fails with 413 when the compression ratio is too high', async () => {
    const req = makeReq({ 'content-encoding': 'gzip' })
    const p = readBody(req, { maxRatio: 2 })
    req.end(gzipSync(Buffer.alloc(1000, 'a')))
    await expectHttpError(p, 413, 'Compression ratio too high')
  })

  describe('non-streamable decompressor', () => {
    const original = compressors.gzip
    afterEach(() => {
      compressors.gzip = original
    })
    const bufferOnlyGzip = () => {
      compressors.gzip = { compress: (b) => gzipSync(b), uncompress: (b) => gunzipSync(b) }
    }

    it('reads raw bytes then decompresses', async () => {
      bufferOnlyGzip()
      const req = makeReq({ 'content-encoding': 'gzip' })
      const p = readBody(req)
      const zipped = gzipSync(Buffer.from('buffered payload'))
      req.write(zipped.subarray(0, 5))
      await tick()
      req.end(zipped.subarray(5))
      expect((await p).toString()).toBe('buffered payload')
    })

    it('enforces maxCompressed on raw bytes', async () => {
      bufferOnlyGzip()
      const req = makeReq({ 'content-encoding': 'gzip' })
      const p = readBody(req, { maxCompressed: 10 })
      req.end(Buffer.alloc(20))
      await expectHttpError(p, 413, 'Payload Too Large')
    })

    it('enforces maxInflated after decompression', async () => {
      bufferOnlyGzip()
      const req = makeReq({ 'content-encoding': 'gzip' })
      const p = readBody(req, { maxInflated: 100, maxRatio: 1000 })
      req.end(gzipSync(Buffer.alloc(1000, 'a')))
      await expectHttpError(p, 413, 'Inflated body too large')
    })
  })
})
