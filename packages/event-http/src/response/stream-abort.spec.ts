import { Readable } from 'node:stream'

import { afterEach, describe, expect, it } from 'vitest'
import { Wooks } from 'wooks'

import { useRequest } from '../composables/request'
import { createHttpApp } from '../http-adapter'

describe('streamed responses on a real server', () => {
  let app: ReturnType<typeof createHttpApp> | undefined
  afterEach(async () => {
    await app?.close()
    app = undefined
  })

  async function start(setup: (a: ReturnType<typeof createHttpApp>) => void) {
    app = createHttpApp({}, new Wooks())
    setup(app)
    await app.listen(0)
    const { port } = app.getServer()!.address() as { port: number }
    return `http://127.0.0.1:${port}`
  }

  it.each([
    ['GET', {}],
    ['POST', { method: 'POST', body: '{"a":1}' }],
  ])(
    'destroys the source stream when the client aborts a %s',
    async (method, init: RequestInit) => {
      const started = Promise.withResolvers<void>()
      const closed = Promise.withResolvers<boolean>()
      const base = await start((a) => {
        a.on(method, '/s', async () => {
          if (init.body) {
            await useRequest().rawBody() // the request 'close' has fired by now
          }
          let i = 0
          const stream = new Readable({
            read() {
              setTimeout(() => {
                if (i === 1) {
                  started.resolve()
                }
                this.push(`chunk-${i++};`)
              }, 5)
            },
          })
          stream.once('close', () => closed.resolve(stream.destroyed))
          return stream
        })
      })
      const ac = new AbortController()
      const res = await fetch(`${base}/s`, { ...init, signal: ac.signal })
      expect(res.ok).toBe(true)
      await started.promise
      ac.abort()
      expect(await closed.promise).toBe(true)
    },
  )

  it('aborts the response when the source stream fails mid-body', async () => {
    const base = await start((a) => {
      a.get('/e', () => {
        let i = 0
        return new Readable({
          read() {
            setTimeout(() => {
              if (i++ < 2) {
                this.push('chunk;')
              } else {
                this.destroy(new Error('source failed'))
              }
            }, 5)
          },
        })
      })
    })
    const res = await fetch(`${base}/e`)
    expect(res.ok).toBe(true)
    // a truncated body must not look complete
    await expect(res.text()).rejects.toThrow()
  })

  it('stops reading a fetch Response body when the client aborts', async () => {
    const started = Promise.withResolvers<void>()
    const cancelled = Promise.withResolvers<void>()
    const base = await start((a) => {
      a.post('/f', async () => {
        await useRequest().rawBody()
        let i = 0
        const body = new ReadableStream<Uint8Array>({
          async pull(controller) {
            await new Promise((resolve) => setTimeout(resolve, 5))
            if (i === 1) {
              started.resolve()
            }
            controller.enqueue(new TextEncoder().encode(`chunk-${i++};`))
          },
          cancel() {
            cancelled.resolve()
          },
        })
        return new Response(body)
      })
    })
    const ac = new AbortController()
    const res = await fetch(`${base}/f`, { method: 'POST', body: '{}', signal: ac.signal })
    expect(res.ok).toBe(true)
    await started.promise
    ac.abort()
    await cancelled.promise
  })
})
