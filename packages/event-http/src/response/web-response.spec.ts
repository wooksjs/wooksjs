import { Readable } from 'stream'
import { describe, expect, it } from 'vitest'
import { Wooks } from 'wooks'

import { createHttpApp } from '../http-adapter'

/*
 * Simplify review (altitude) — `toWebResponse()` (in-process fetch):
 *  - a body it does not send (HEAD) is released like `send()` releases it: a stream is
 *    destroyed (its file descriptor freed), a fetch Response body is cancelled;
 *  - a `Uint8Array` body is sent as the view itself: a pooled or sliced Buffer shares a larger
 *    backing ArrayBuffer, which must never leak into the response.
 */

const tick = () => new Promise((r) => setImmediate(r))

describe('in-process HEAD releases the body it does not send', () => {
  it('destroys a stream body', async () => {
    const app = createHttpApp(undefined, new Wooks())
    const streams: Readable[] = []
    app.all('/s', () => {
      const s = Readable.from([Buffer.from('hello')])
      streams.push(s)
      return s
    })
    for (const method of ['HEAD', 'GET']) {
      const res = (await app.request('/s', { method }))!
      await res.arrayBuffer()
      await tick()
      expect(streams.at(-1)!.destroyed, method).toBe(true)
    }
  })

  it('cancels a fetch Response body', async () => {
    const app = createHttpApp(undefined, new Wooks())
    const cancelled: boolean[] = []
    app.all('/r', () => {
      const index = cancelled.push(false) - 1
      const body = new ReadableStream({
        pull(controller) {
          controller.enqueue(new TextEncoder().encode('chunk'))
        },
        cancel() {
          cancelled[index] = true
        },
      })
      return new Response(body, { headers: { 'content-type': 'text/plain' } })
    })
    const res = (await app.request('/r', { method: 'HEAD' }))!
    expect(res.body).toBeNull()
    await tick()
    expect(cancelled).toEqual([true])
  })
})

describe('in-process Uint8Array bodies send exactly their bytes', () => {
  const BODIES: Record<string, () => Uint8Array> = {
    'pooled Buffer': () => Buffer.from('hello'),
    'sliced Buffer': () => Buffer.alloc(100, 97).subarray(10, 20),
    'Uint8Array view': () => new Uint8Array(new ArrayBuffer(64), 8, 4).fill(98),
    'whole Uint8Array': () => new Uint8Array([1, 2, 3]),
    'empty view': () => Buffer.alloc(16).subarray(4, 4),
  }
  for (const [name, make] of Object.entries(BODIES)) {
    it(name, async () => {
      const app = createHttpApp(undefined, new Wooks())
      let sent: Uint8Array | undefined
      app.get('/b', () => (sent = make()))
      const res = (await app.request('/b'))!
      const got = new Uint8Array(await res.arrayBuffer())
      expect([...got]).toEqual([...sent!])
      expect(res.headers.get('content-length') ?? '0').toBe(String(sent!.byteLength))
    })
  }
})
