/**
 * Body Parser — extension library pattern
 *
 * Demonstrates: library-to-library dependency via exported cached slots,
 *               cached async computation, defineWook extension
 */
import { cached, defineWook } from '../src/index'

// Depend on http-context's building blocks — not its wooks
import { rawBody, headersMap } from './http-context'

// ═══════════════════════════════════════════════
// Cached — JSON/text parsing, runs once per event
// ═══════════════════════════════════════════════

const parsedBody = cached(async (ctx) => {
  const [buffer, headers] = await Promise.all([
    ctx.get(rawBody),
    Promise.resolve(ctx.get(headersMap)),
  ])

  const ct = (headers['content-type'] as string) ?? ''

  if (ct.includes('application/json')) {
    return JSON.parse(buffer.toString('utf8'))
  }
  if (ct.includes('text/')) {
    return buffer.toString('utf8')
  }
  if (ct.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(buffer.toString('utf8')))
  }

  return buffer // raw Buffer for unknown types
})

// ═══════════════════════════════════════════════
// Wook — public API
// ═══════════════════════════════════════════════

/**
 * Body parser wook.
 *
 * parseBody() is a thunk — body is read + parsed on first call, cached after.
 * Multiple consumers (auth interceptor, handler, logger) all get the same result.
 */
export const useBody = defineWook((ctx) => ({
  parseBody: () => ctx.get(parsedBody),

  /** Convenience: parse + cast to a known type */
  parseAs: <T>() => ctx.get(parsedBody) as Promise<T>,
}))
