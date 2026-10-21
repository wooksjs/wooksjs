import { Readable } from 'stream'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Wooks } from 'wooks'

import { createHttpApp } from '../http-adapter'
import type { WooksHttp } from '../http-adapter'
import { EHttpStatusCode } from '../utils/status-codes'
import { DEFAULT_HTTP_STATUS, getDefaultHttpStatus } from './http-response'

/*
 * Default status contract: a handler that sets no status answers
 *   - 204 when there is no body (any method);
 *   - 201 for POST with a body;
 *   - 200 for every other method with a body (PUT, PATCH, DELETE included).
 * The oracle below is that rule written out; every method × body × send path is checked.
 */
function oracle(method: string, hasBody: boolean): number {
  if (!hasBody) {
    return 204
  }
  return method === 'POST' ? 201 : 200
}

const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']
const bodies = {
  json: () => ({ ok: true }),
  text: () => 'ok',
  stream: () => Readable.from(['ok']),
  none: () => undefined,
}

let app: WooksHttp
let base: string

beforeAll(async () => {
  app = createHttpApp(undefined, new Wooks())
  for (const [kind, make] of Object.entries(bodies)) {
    app.all(`/${kind}`, make as () => unknown)
  }
  await app.listen(0, '127.0.0.1')
  const addr = app.getServer()!.address() as { port: number }
  base = `http://127.0.0.1:${addr.port}`
})

afterAll(() => app.close())

describe('default response status', () => {
  for (const method of methods) {
    for (const kind of Object.keys(bodies)) {
      const hasBody = kind !== 'none'
      const expected = oracle(method, hasBody)
      it(`${method} ${kind} → ${expected} (server)`, async () => {
        const res = await fetch(`${base}/${kind}`, { method })
        expect(res.status).toBe(expected)
      })
      it(`${method} ${kind} → ${expected} (programmatic fetch)`, async () => {
        const res = await app.request(`/${kind}`, { method })
        expect(res!.status).toBe(expected)
      })
    }
  }

  it('exports the table the runtime uses', () => {
    expect(DEFAULT_HTTP_STATUS).toEqual({
      GET: 200,
      POST: 201,
      PUT: 200,
      PATCH: 200,
      DELETE: 200,
    })
    expect(Object.isFrozen(DEFAULT_HTTP_STATUS)).toBe(true)
    for (const inherited of ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf']) {
      expect(getDefaultHttpStatus(inherited, true), inherited).toBe(200)
    }
    for (const method of [...methods, 'PROPFIND']) {
      expect(getDefaultHttpStatus(method, true)).toBe(oracle(method, true))
      expect(getDefaultHttpStatus(method, false)).toBe(EHttpStatusCode.NoContent)
    }
  })
})
