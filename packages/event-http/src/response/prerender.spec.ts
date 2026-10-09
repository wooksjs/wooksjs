import { createServer } from 'http'
import type { Server } from 'http'
import type { AddressInfo } from 'net'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { Wooks } from 'wooks'

import { useResponse } from '../composables/response'
import { HttpError } from '../errors'
import { createHttpApp } from '../http-adapter'
import { prerenderJson } from './prerender'

const logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {}, log: () => {} }

function deepFreeze<T>(obj: T): T {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    Object.freeze(obj)
    for (const v of Object.values(obj)) {
      deepFreeze(v)
    }
  }
  return obj
}

const meta = prerenderJson(
  deepFreeze({ name: 'tasks', fields: [{ key: 'id' }, { key: 'title' }] }),
  {
    etag: true,
  },
)
const noEtag = prerenderJson(deepFreeze({ plain: true, text: 'héllo' }))

function makeApp() {
  const app = createHttpApp({ logger: logger as any }, new Wooks({ logger: logger as any }))
  app.get('/meta', () => {
    useResponse()
      .setHeader('cache-control', 'private, no-cache')
      .setHeader('vary', 'Authorization, Cookie')
    return meta
  })
  app.get('/meta-async', async () => meta)
  app.get('/plain', () => noEtag)
  app.get('/fresh', () => ({ name: 'tasks', fields: [{ key: 'id' }, { key: 'title' }] }))
  app.get('/meta-404', () => {
    useResponse().setStatus(404)
    return meta
  })
  app.get('/meta-forbidden', () => {
    throw new HttpError(403, 'Forbidden')
  })
  app.get('/meta-explicit-etag', () => {
    useResponse().setHeader('ETag', '"mine"')
    return meta
  })
  app.post('/meta', () => meta)
  app.head('/meta', () => meta)
  return app
}

describe('prerenderJson', () => {
  it('returns the same object and is idempotent', () => {
    const obj = { a: 1 }
    expect(prerenderJson(obj)).toBe(obj)
    expect(prerenderJson(obj, { etag: true })).toBe(obj)
  })

  it('rejects values that do not serialize to JSON', () => {
    expect(() => prerenderJson({ toJSON: () => undefined })).toThrow(TypeError)
  })

  it('serializes once: later reads never call JSON.stringify for the object', async () => {
    const app = makeApp()
    const spy = vi.spyOn(JSON, 'stringify')
    const res = await app.fetch(new Request('http://localhost/plain'))
    expect(await res!.text()).toBe(JSON.stringify(noEtag))
    expect(spy.mock.calls.filter(([v]) => v === noEtag)).toHaveLength(1) // only the assertion above
    spy.mockRestore()
  })

  describe('over a socket (sendRegular)', () => {
    let server: Server
    let base: string
    beforeAll(async () => {
      server = createServer(makeApp().getServerCb() as any)
      await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
      base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    })
    afterAll(() => new Promise((r) => server.close(r)))

    it('sends the prerendered JSON with ETag and the handler headers', async () => {
      const res = await fetch(`${base}/meta`)
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toBe('application/json')
      expect(res.headers.get('etag')).toMatch(/^W\/"[\w-]{22}"$/)
      expect(res.headers.get('cache-control')).toBe('private, no-cache')
      expect(res.headers.get('vary')).toBe('Authorization, Cookie')
      expect(await res.text()).toBe(JSON.stringify(meta))
    })

    it('ETag is derived from the bytes (equal content → equal ETag)', async () => {
      const etag = (await fetch(`${base}/meta`)).headers.get('etag')!
      const twin = prerenderJson(
        { name: 'tasks', fields: [{ key: 'id' }, { key: 'title' }] },
        {
          etag: true,
        },
      )
      const app = createHttpApp({ logger: logger as any }, new Wooks({ logger: logger as any }))
      app.get('/twin', () => twin)
      const res = await app.fetch(new Request('http://localhost/twin'))
      expect(res!.headers.get('etag')).toBe(etag)
    })

    it('answers a matching If-None-Match with 304, no body, headers kept', async () => {
      const etag = (await fetch(`${base}/meta`)).headers.get('etag')!
      for (const inm of [etag, etag.slice(2), `"other", ${etag}`, '*']) {
        const res = await fetch(`${base}/meta`, { headers: { 'if-none-match': inm } })
        expect(res.status).toBe(304)
        expect(await res.text()).toBe('')
        expect(res.headers.get('etag')).toBe(etag)
        expect(res.headers.get('cache-control')).toBe('private, no-cache')
        expect(res.headers.get('vary')).toBe('Authorization, Cookie')
        expect(res.headers.get('content-type')).toBeNull()
      }
    })

    it('304 also works for async handlers and HEAD', async () => {
      const etag = (await fetch(`${base}/meta`)).headers.get('etag')!
      const a = await fetch(`${base}/meta-async`, { headers: { 'if-none-match': etag } })
      expect(a.status).toBe(304)
      const h = await fetch(`${base}/meta`, { method: 'HEAD', headers: { 'if-none-match': etag } })
      expect(h.status).toBe(304)
    })

    it('a stale If-None-Match gets 200 with the full body', async () => {
      const res = await fetch(`${base}/meta`, { headers: { 'if-none-match': 'W/"stale"' } })
      expect(res.status).toBe(200)
      expect(await res.text()).toBe(JSON.stringify(meta))
    })

    it('never 304 on non-2xx: explicit 404 status, thrown errors', async () => {
      const etag = (await fetch(`${base}/meta`)).headers.get('etag')!
      const r404 = await fetch(`${base}/meta-404`, { headers: { 'if-none-match': etag } })
      expect(r404.status).toBe(404)
      expect(r404.headers.get('etag')).toBeNull()
      expect(await r404.text()).toBe(JSON.stringify(meta))
      const r403 = await fetch(`${base}/meta-forbidden`, {
        headers: { 'if-none-match': etag, accept: 'application/json' },
      })
      expect(r403.status).toBe(403)
      expect(r403.headers.get('etag')).toBeNull()
    })

    it('no ETag and no 304 for non-GET/HEAD methods (POST → 201)', async () => {
      const etag = (await fetch(`${base}/meta`)).headers.get('etag')!
      const res = await fetch(`${base}/meta`, {
        method: 'POST',
        headers: { 'if-none-match': etag },
      })
      expect(res.status).toBe(201)
      expect(res.headers.get('etag')).toBeNull()
      expect(await res.text()).toBe(JSON.stringify(meta))
    })

    it('an explicit ETag header wins and disables 304', async () => {
      const etag = (await fetch(`${base}/meta`)).headers.get('etag')!
      const res = await fetch(`${base}/meta-explicit-etag`, { headers: { 'if-none-match': etag } })
      expect(res.status).toBe(200)
      expect(res.headers.get('etag')).toBe('"mine"')
    })

    it('registered without etag: no ETag header, never 304', async () => {
      const res = await fetch(`${base}/plain`, { headers: { 'if-none-match': '*' } })
      expect(res.status).toBe(200)
      expect(res.headers.get('etag')).toBeNull()
      expect(await res.json()).toEqual(noEtag)
    })

    it('unregistered objects are serialized as before, without ETag', async () => {
      const res = await fetch(`${base}/fresh`, { headers: { 'if-none-match': '*' } })
      expect(res.status).toBe(200)
      expect(res.headers.get('etag')).toBeNull()
      expect(await res.text()).toBe(JSON.stringify(meta))
    })
  })

  describe('app.fetch (toWebResponse)', () => {
    const app = makeApp()

    it('200 with ETag, then 304 on a matching If-None-Match', async () => {
      const first = (await app.fetch(new Request('http://localhost/meta')))!
      expect(first.status).toBe(200)
      expect(await first.text()).toBe(JSON.stringify(meta))
      const etag = first.headers.get('etag')!
      expect(etag).toMatch(/^W\//)

      const second = (await app.fetch(
        new Request('http://localhost/meta', { headers: { 'if-none-match': etag } }),
      ))!
      expect(second.status).toBe(304)
      expect(second.headers.get('etag')).toBe(etag)
      expect(second.headers.get('cache-control')).toBe('private, no-cache')
      expect(second.headers.get('vary')).toBe('Authorization, Cookie')
      expect(second.headers.get('content-type')).toBeNull()
      expect(await second.text()).toBe('')
    })

    it('never 304 on errors', async () => {
      const res = (await app.fetch(
        new Request('http://localhost/meta-forbidden', { headers: { 'if-none-match': '*' } }),
      ))!
      expect(res.status).toBe(403)
    })
  })

  it('a frozen registered object makes accidental mutation throw (documented contract)', () => {
    expect(() => {
      ;(meta as any).name = 'changed'
    }).toThrow(TypeError)
    expect(() => {
      ;(meta.fields as any).push({ key: 'x' })
    }).toThrow(TypeError)
  })
})
