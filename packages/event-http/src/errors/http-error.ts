import type { EHttpStatusCode, THttpErrorCodes } from '../utils/status-codes'
import { httpStatusCodes } from '../utils/status-codes'

/** Represents an HTTP error with a status code and optional structured body. */
export class HttpError<T extends TWooksErrorBody = TWooksErrorBody> extends Error {
  name = 'HttpError'

  constructor(
    protected code: THttpErrorCodes = 500,
    protected _body: string | T = '',
  ) {
    // Temporarily disable stack trace capture — these are expected control-flow
    // errors (401, 404, etc.), not bugs.  Stack traces cost ~10-20 µs each.
    const prev = Error.stackTraceLimit
    Error.stackTraceLimit = 0
    super(typeof _body === 'string' ? _body : _body.message)
    Error.stackTraceLimit = prev
  }

  get body(): TWooksErrorBodyExt {
    return typeof this._body === 'string'
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
        }
  }
}

/** Base shape for an HTTP error response body. */
export interface TWooksErrorBody {
  message: string
  statusCode: EHttpStatusCode
  error?: string
}

/** Extended error body that always includes the error description string. */
export interface TWooksErrorBodyExt extends TWooksErrorBody {
  error: string
}
