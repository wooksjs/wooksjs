import { useLogger } from '@wooksjs/event-core'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { Wooks } from 'wooks'

import { createHttpApp } from '../http-adapter'
import type { WooksHttp } from '../http-adapter'
import { HttpError } from './http-error'
import type { TWooksErrorBodyExt } from './http-error'

/*
 * Error-body contract:
 *  - `HttpError` carries any extra body fields, plus optional `code` (UPPER_SNAKE) and `params`;
 *    `statusCode`, `message` and `error` (the status text) are always set by the error itself.
 *  - `transformErrorBody(body, error, ctx)` (app option) sees EVERY error response the app renders
 *    — thrown `HttpError`s, other thrown errors (as 500), the router's own 404 — and its return
 *    value is what gets rendered (JSON, HTML or text). A hook that throws is logged and the
 *    original body is sent.
 */

const quiet = { info() {}, warn() {}, error: vi.fn(), log() {}, debug() {}, trace() {} } as never

describe('HttpError body', () => {
  it('keeps extra fields, code and params', () => {
    const error = new HttpError(409, {
      message: 'Name taken',
      code: 'NAME_TAKEN',
      params: { name: 'bob' },
      field: 'name',
    })
    expect(error.body).toEqual({
      statusCode: 409,
      error: 'Conflict',
      message: 'Name taken',
      code: 'NAME_TAKEN',
      params: { name: 'bob' },
      field: 'name',
    })
    expect(error.message).toBe('Name taken')
  })

  it('a string body has no code', () => {
    expect(new HttpError(404, 'nope').body).toEqual({
      statusCode: 404,
      error: 'Not Found',
      message: 'nope',
    })
  })

  it('statusCode and error always come from the error, not the body', () => {
    const error = new HttpError(400, { message: 'm', statusCode: 500, error: 'spoof' })
    expect(error.body.statusCode).toBe(400)
    expect(error.body.error).toBe('Bad Request')
  })
})

describe('transformErrorBody', () => {
  const seen: Array<{ body: TWooksErrorBodyExt; error: unknown }> = []
  let app: WooksHttp
  let base: string

  beforeAll(async () => {
    app = createHttpApp(
      {
        logger: quiet,
        transformErrorBody(body, error) {
          seen.push({ body, error })
          if (body.code === 'BOOM') {
            throw new Error('translator failed')
          }
          return {
            ...body,
            message: body.code
              ? `[ru] ${body.code} ${JSON.stringify(body.params ?? {})}`
              : `[ru] ${body.message}`,
          }
        },
      },
      new Wooks(),
    )
    app.get('/coded', () => {
      throw new HttpError(422, { message: 'Too short', code: 'MIN_LENGTH', params: { min: 3 } })
    })
    app.get('/plain', () => {
      throw new Error('internal detail')
    })
    app.get('/returned', () => new HttpError(403, 'Forbidden here'))
    app.get('/boom', () => {
      throw new HttpError(400, { message: 'original', code: 'BOOM' })
    })
    app.get('/ok', () => {
      useLogger()
      return 'fine'
    })
    await app.listen(0, '127.0.0.1')
    base = `http://127.0.0.1:${(app.getServer()!.address() as { port: number }).port}`
  })

  afterAll(() => app.close())

  async function get(path: string, accept = 'application/json') {
    const res = await fetch(`${base}${path}`, { headers: { accept } })
    return { status: res.status, text: await res.text() }
  }

  it('transforms a thrown HttpError (code + params reach the hook)', async () => {
    const r = await get('/coded')
    expect(r.status).toBe(422)
    expect(JSON.parse(r.text)).toEqual({
      statusCode: 422,
      error: 'Unprocessable Entity',
      message: '[ru] MIN_LENGTH {"min":3}',
      code: 'MIN_LENGTH',
      params: { min: 3 },
    })
    expect(seen.at(-1)!.error).toBeInstanceOf(HttpError)
  })

  it('transforms a returned HttpError', async () => {
    const r = await get('/returned')
    expect(r.status).toBe(403)
    expect(JSON.parse(r.text).message).toBe('[ru] Forbidden here')
  })

  it('transforms a non-HttpError (sent as 500)', async () => {
    const r = await get('/plain')
    expect(r.status).toBe(500)
    expect(JSON.parse(r.text).message).toBe('[ru] internal detail')
  })

  it("transforms the router's own 404", async () => {
    const r = await get('/missing')
    expect(r.status).toBe(404)
    expect(JSON.parse(r.text)).toMatchObject({ statusCode: 404, message: '[ru] ' })
  })

  it('applies before HTML and text rendering too', async () => {
    expect((await get('/coded', 'text/html')).text).toContain('[ru] MIN_LENGTH')
    expect((await get('/coded', 'text/plain')).text).toContain('[ru] MIN_LENGTH')
  })

  it('a throwing hook is logged and the original body is sent', async () => {
    const r = await get('/boom')
    expect(r.status).toBe(400)
    expect(JSON.parse(r.text).message).toBe('original')
    expect((quiet as { error: ReturnType<typeof vi.fn> }).error).toHaveBeenCalled()
  })

  it('is not called for successful responses', async () => {
    const before = seen.length
    expect((await get('/ok')).text).toBe('fine')
    expect(seen.length).toBe(before)
  })

  it('applies to programmatic fetch() as well', async () => {
    const res = await app.request('/coded', { headers: { accept: 'application/json' } })
    expect((await res!.json()).message).toBe('[ru] MIN_LENGTH {"min":3}')
  })
})
