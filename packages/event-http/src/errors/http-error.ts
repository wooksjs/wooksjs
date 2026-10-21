import type { EHttpStatusCode, THttpErrorCodes } from '../utils/status-codes'
import { httpStatusCodes } from '../utils/status-codes'

/**
 * An object body for {@link HttpError}: `message` plus, optionally, a machine-readable `code`
 * (UPPER_SNAKE, e.g. `'NAME_TAKEN'`) with its `params`, and any extra fields of your own.
 */
export interface THttpErrorBodyInput {
  /** Human-readable message (default language). Becomes `error.message`. */
  message: string
  /** Stable machine-readable code, UPPER_SNAKE (`'NAME_TAKEN'`) — the key a translator looks up. */
  code?: string
  /** Values for the message template (`{ min: 3 }`), so a translator can rebuild the text. */
  params?: Record<string, unknown>
}

/**
 * The rendered body of an `HttpError` whose input fields are `T`: your fields (a narrowed
 * `statusCode` such as `400 | 409` is kept), plus `error` (the status text, always a string).
 * At runtime `statusCode`, `message` and `error` are always the error's own.
 */
export type THttpErrorBody<T extends object = THttpErrorBodyInput> = Omit<T, 'error'> &
  Omit<TWooksErrorBodyExt, Exclude<keyof T, 'error'>> & { error: string }

/**
 * An HTTP error with a status and an optional structured body.
 *
 * Throw (or return) it from a handler; the response renders `body` as JSON, HTML or text
 * (content-negotiated), after the app's `transformErrorBody` hook, if any.
 *
 * The body type is inferred from the constructor argument, so extra fields type-check:
 * ```ts
 * throw new HttpError(409, { message: 'Name taken', code: 'NAME_TAKEN', params: { name }, field: 'name' })
 * ```
 * At runtime `statusCode`, `message` and `error` (the status text) in the rendered body always
 * come from the error itself, whatever the body object holds.
 *
 * @typeParam T - The body fields (inferred). Must include `message` when an object is passed.
 */
export class HttpError<T extends object = THttpErrorBodyInput> extends Error {
  name = 'HttpError'

  protected code: THttpErrorCodes
  protected _body: string | (T & THttpErrorBodyInput)

  /** @param code - HTTP status (default 500). @param message - Error message. */
  constructor(code?: THttpErrorCodes, message?: string)
  /** @param code - HTTP status. @param body - `message` plus optional `code` (UPPER_SNAKE), `params` and your fields. */
  constructor(code: THttpErrorCodes, body: T & THttpErrorBodyInput)
  /** For subclasses that forward either form. */
  constructor(code: THttpErrorCodes, body: string | (T & THttpErrorBodyInput))
  constructor(code: THttpErrorCodes = 500, _body: string | (T & THttpErrorBodyInput) = '') {
    // Temporarily disable stack trace capture — these are expected control-flow
    // errors (401, 404, etc.), not bugs.  Stack traces cost ~10-20 µs each.
    const prev = Error.stackTraceLimit
    Error.stackTraceLimit = 0
    super(typeof _body === 'string' ? _body : _body.message)
    Error.stackTraceLimit = prev
    this.code = code
    this._body = _body
  }

  /** The body the response renders: your fields plus `statusCode`, `message` and `error`. */
  get body(): THttpErrorBody<T> {
    return (typeof this._body === 'string'
      ? {
          statusCode: this.code,
          message: this.message,
          error: httpStatusCodes[this.code],
        }
      : {
          ...this._body,
          statusCode: this.code,
          message: this.message,
          error: httpStatusCodes[this.code],
        }) as unknown as THttpErrorBody<T>
  }
}

/** Base shape for an HTTP error response body. */
export interface TWooksErrorBody {
  message: string
  statusCode: EHttpStatusCode
  error?: string
  /** Machine-readable code, UPPER_SNAKE (see {@link THttpErrorBodyInput.code}). */
  code?: string
  /** Template values for `message` (see {@link THttpErrorBodyInput.params}). */
  params?: Record<string, unknown>
}

/** Extended error body that always includes the error description string. */
export interface TWooksErrorBodyExt extends TWooksErrorBody {
  error: string
}
