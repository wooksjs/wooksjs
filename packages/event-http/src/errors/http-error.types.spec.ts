import { describe, expectTypeOf, it } from 'vitest'

import { HttpError } from './http-error'
import type { THttpErrorBodyInput, TWooksErrorBody, TWooksErrorBodyExt } from './http-error'

/*
 * Type contract (checked by `tsc`, see the release checklist; vitest only runs it):
 * extra body fields type-check and show up on `.body`, `code`/`params` are optional,
 * and `message` stays required for an object body.
 */
describe('HttpError body typing', () => {
  it('infers extra fields from the constructor argument', () => {
    const error = new HttpError(409, { message: 'taken', field: 'name', code: 'NAME_TAKEN' })
    expectTypeOf(error.body.field).toEqualTypeOf<string>()
    expectTypeOf(error.body.code).toEqualTypeOf<string>()
    expectTypeOf(error.body.message).toEqualTypeOf<string>()
    expectTypeOf(error.body).toMatchTypeOf<TWooksErrorBodyExt>()
  })

  it('accepts an explicit body type', () => {
    interface Conflict {
      message: string
      field: string
      statusCode: 409
    }
    const error = new HttpError<Conflict>(409, { message: 'taken', field: 'name', statusCode: 409 })
    expectTypeOf(error.body.field).toEqualTypeOf<string>()
  })

  it('code and params are optional on the base body', () => {
    const error = new HttpError(400, 'plain')
    expectTypeOf(error.body.code).toEqualTypeOf<string | undefined>()
    expectTypeOf(error.body.params).toEqualTypeOf<Record<string, unknown> | undefined>()
  })

  it('an explicit TWooksErrorBody body still assigns to TWooksErrorBodyExt (error: string)', () => {
    const error = new HttpError<TWooksErrorBody>(400, { message: 'x', statusCode: 400 })
    const ext: TWooksErrorBodyExt = error.body
    expectTypeOf(ext.error).toEqualTypeOf<string>()
    expectTypeOf(error.body.error).toEqualTypeOf<string>()
  })

  it('downstream subclasses with narrowed fields keep compiling', () => {
    interface Body1 {
      name: string
      message: string
      statusCode: 400 | 409
      code: 'A' | 'B'
      action: string
    }
    class E1 extends HttpError<Body1> {
      constructor() {
        super(400, { name: 'E1', message: 'm', statusCode: 400, code: 'A', action: 'x' })
      }
    }
    const body = new E1().body
    expectTypeOf(body.code).toEqualTypeOf<'A' | 'B'>()
    expectTypeOf(body.statusCode).toMatchTypeOf<number>()
    class E3 extends HttpError {
      override get body(): TWooksErrorBodyExt {
        return { message: '', statusCode: 500, error: 'x' }
      }
    }
    void E3
  })

  it('a subclass may forward a string-or-body union', () => {
    class Wrap<T extends object> extends HttpError<T> {
      // oxlint-disable-next-line no-useless-constructor -- the forwarding signature IS the test
      constructor(code: 400 | 500, body: string | (T & THttpErrorBodyInput)) {
        super(code, body)
      }
    }
    void Wrap
    const maybe = undefined as string | undefined
    void new HttpError(400, maybe)
  })

  it('keeps a narrowed statusCode / name from the body type', () => {
    interface Narrow {
      name: 'NarrowError'
      message: string
      statusCode: 400 | 409
    }
    const body = new HttpError<Narrow>(409, { name: 'NarrowError', message: 'm', statusCode: 409 })
      .body
    expectTypeOf(body.statusCode).toEqualTypeOf<400 | 409>()
    expectTypeOf(body.name).toEqualTypeOf<'NarrowError'>()
    expectTypeOf(body.error).toEqualTypeOf<string>()
  })

  it('code must be a string', () => {
    // @ts-expect-error — code is a string (UPPER_SNAKE)
    void new HttpError(400, { message: 'x', code: 42 })
  })

  it('an object body needs a message', () => {
    // @ts-expect-error — message is required
    void new HttpError(400, { code: 'NO_MESSAGE' })
  })

  it('error is reserved for the status text; a machine code goes in code', () => {
    // @ts-expect-error — `error` is the status text, the body value would be overwritten
    void new HttpError(412, { message: 'Stale', error: 'STALE_DOC' })
    const error = new HttpError(412, { message: 'Stale', code: 'STALE_DOC', doc: 'a' })
    expectTypeOf(error.body.code).toEqualTypeOf<string>()
    expectTypeOf(error.body.doc).toEqualTypeOf<string>()
    expectTypeOf(error.body.error).toEqualTypeOf<string>()
    interface WithError {
      message: string
      error: string
    }
    // @ts-expect-error — also when the body type is explicit
    void new HttpError<WithError>(412, { message: 'Stale', error: 'STALE_DOC' })
  })

  it('re-wrapping a rendered body needs its `error` dropped first', () => {
    const upstream = new HttpError(409, { message: 'taken', code: 'NAME_TAKEN', field: 'name' })
    // @ts-expect-error — a rendered body carries `error` (the status text)
    void new HttpError(502, upstream.body)
    const plain = {} as TWooksErrorBody
    // @ts-expect-error — so may a TWooksErrorBody
    void new HttpError(502, plain)
    const { error: _error, ...rest } = upstream.body
    const wrapped = new HttpError(502, rest)
    expectTypeOf(wrapped.body.code).toEqualTypeOf<string>()
    expectTypeOf(wrapped.body.field).toEqualTypeOf<string>()
  })
})
