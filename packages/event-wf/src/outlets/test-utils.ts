import type { TConsoleBase } from '@prostojs/logger'
import { HttpError, prepareTestHttpContext, useResponse } from '@wooksjs/event-http'

/** A logger that swallows everything (pass as `logger` to apps / Wooks under test). */
export const quietLogger = {
  warn() {},
  info() {},
  error() {},
  log() {},
  debug() {},
  trace() {},
} as unknown as TConsoleBase

export interface PostResult {
  // oxlint-disable-next-line typescript-eslint/no-explicit-any -- tests read arbitrary response shapes
  body: any
  status: number | undefined
  /** response headers as buffered (lower-case names) */
  headers: Readonly<Record<string, string | string[]>>
  /** what was thrown — an `HttpError` carries its `body` */
  // oxlint-disable-next-line typescript-eslint/no-explicit-any -- tests read arbitrary error bodies
  error?: Error & { body?: any }
}

/**
 * Run `fn` inside a POST request context with a JSON body (and optional
 * headers); returns its result, the response status and any thrown error
 * (a thrown `HttpError` gives its status and body, as the HTTP adapter sends them).
 */
export function postJson(
  fn: () => unknown,
  body: unknown,
  headers?: Record<string, string>,
): Promise<PostResult> {
  return prepareTestHttpContext({
    url: '/wf',
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    rawBody: JSON.stringify(body),
  })(async () => {
    try {
      const r = await fn()
      return { body: r, status: useResponse().status, headers: useResponse().headers() }
    } catch (error) {
      // A refused request is thrown as an HttpError — read it as the HTTP adapter would send it
      const sent = useResponse().headers()
      if (error instanceof HttpError) {
        return { body: error.body, status: error.body.statusCode, headers: sent, error }
      }
      return { body: undefined, status: useResponse().status, headers: sent, error: error as Error }
    }
  })
}

/** The strategy handle inside a trigger token (`<strategy>.<handle>`). */
export function rawHandle(token: unknown): string {
  return String(token).split('.').slice(1).join('.')
}
