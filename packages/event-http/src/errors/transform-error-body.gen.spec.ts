import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Wooks } from 'wooks'

import { createHttpApp } from '../http-adapter'
import type { WooksHttp } from '../http-adapter'
import { WooksHttpResponse } from '../response/wooks-http-response'
import { HttpError } from './http-error'
import type { TWooksErrorBodyExt } from './http-error'

/*
 * Review M1 — an error response ALWAYS arrives, with the original status, whatever the
 * `transformErrorBody` hook returns or throws and whatever the error renderer does.
 * The hook's result is used only when it is a plain object with a numeric `statusCode` and a
 * string `message`; the status never changes (the hook transforms the body, not the status).
 */

const quiet = { info() {}, warn() {}, error() {}, log() {}, debug() {}, trace() {} } as never

type Hook = (body: TWooksErrorBodyExt) => unknown
const VALID = 'TRANSLATED'
const RESULTS: Record<string, { hook: Hook; valid: boolean }> = {
  undefined: { hook: () => undefined, valid: false },
  null: { hook: () => null, valid: false },
  zero: { hook: () => 0, valid: false },
  'empty string': { hook: () => '', valid: false },
  array: { hook: () => [], valid: false },
  promise: { hook: async (b) => ({ ...b, message: VALID }), valid: false },
  'statusCode string': { hook: (b) => ({ ...b, statusCode: 'x', message: VALID }), valid: false },
  'message number': { hook: (b) => ({ ...b, message: 1 }), valid: false },
  '{}': { hook: () => ({}), valid: false },
  throws: {
    hook: () => {
      throw new Error('hook bug')
    },
    valid: false,
  },
  'valid (spread)': { hook: (b) => ({ ...b, message: VALID }), valid: true },
  'valid, other status, no error field': {
    hook: () => ({ statusCode: 599, message: VALID }),
    valid: true,
  },
}

const SOURCES: Record<string, { path: string; status: number; message: string }> = {
  thrown: { path: '/thrown', status: 409, message: 'taken' },
  returned: { path: '/returned', status: 403, message: 'nope' },
  'router 404': { path: '/missing', status: 404, message: '' },
  'plain Error': { path: '/plain', status: 500, message: 'internal' },
}
const ACCEPTS = ['application/json', 'text/html', 'text/plain']

const apps: Record<string, { app: WooksHttp; base: string }> = {}

beforeAll(async () => {
  for (const [name, { hook }] of Object.entries(RESULTS)) {
    const app = createHttpApp({ logger: quiet, transformErrorBody: hook as never }, new Wooks())
    app.get('/thrown', () => {
      throw new HttpError(409, { message: 'taken', code: 'NAME_TAKEN' })
    })
    app.get('/returned', () => new HttpError(403, 'nope'))
    app.get('/plain', () => {
      throw new Error('internal')
    })
    await app.listen(0, '127.0.0.1')
    apps[name] = {
      app,
      base: `http://127.0.0.1:${(app.getServer()!.address() as { port: number }).port}`,
    }
  }
})
afterAll(() => Promise.all(Object.values(apps).map(({ app }) => app.close())))

describe('transformErrorBody results × sources × Accept × path', () => {
  for (const [rName, { valid }] of Object.entries(RESULTS)) {
    for (const [sName, src] of Object.entries(SOURCES)) {
      it(`${rName} / ${sName}`, async () => {
        const { app, base } = apps[rName]
        for (const accept of ACCEPTS) {
          const viaSocket = await fetch(`${base}${src.path}`, {
            headers: { accept },
            signal: AbortSignal.timeout(2000),
          })
          // an unmatched route never reaches app.fetch() handlers (it returns null) — socket only
          const viaFetch =
            sName === 'router 404'
              ? undefined
              : (await app.request(src.path, { headers: { accept } }))!
          const paths: Array<[string, Response]> = [['socket', viaSocket]]
          if (viaFetch) {
            paths.push(['fetch', viaFetch])
          }
          for (const [via, res] of paths) {
            const label = `${accept} via ${via}`
            expect(res.status, label).toBe(src.status)
            const text = await res.text()
            const expected = valid ? VALID : src.message
            if (accept === 'application/json') {
              const body = JSON.parse(text)
              expect(body.message, label).toBe(expected)
              expect(body.statusCode, label).toBe(src.status)
            } else if (expected) {
              expect(text, label).toContain(expected)
            }
          }
        }
      })
    }
  }
})

describe('a throwing error renderer', () => {
  let app: WooksHttp
  let base: string
  beforeAll(async () => {
    class Broken extends WooksHttpResponse {
      protected renderError(): void {
        throw new Error('renderer bug')
      }
    }
    app = createHttpApp({ logger: quiet, responseClass: Broken }, new Wooks())
    app.get('/e', () => {
      throw new HttpError(409, 'taken')
    })
    await app.listen(0, '127.0.0.1')
    base = `http://127.0.0.1:${(app.getServer()!.address() as { port: number }).port}`
  })
  afterAll(() => app.close())

  it('still answers with the original status and a JSON body', async () => {
    for (const path of ['/e', '/missing']) {
      const res = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(2000) })
      expect(res.status).toBe(path === '/e' ? 409 : 404)
      expect(JSON.parse(await res.text())).toMatchObject({ statusCode: res.status })
      if (path === '/e') {
        expect((await app.request(path))!.status).toBe(409)
      }
    }
  })
})
