import type { EventKind, Key, SlotMarker } from './types'
import { key } from './key'

/**
 * Type-level marker used inside `defineEventKind` schemas. Each `slot<T>()`
 * becomes a typed `Key<T>` on the resulting `EventKind`. Has no runtime behavior.
 *
 * @example
 * ```ts
 * const httpKind = defineEventKind('http', {
 *   req: slot<IncomingMessage>(),
 *   response: slot<HttpResponse>(),
 * })
 * ```
 */
export function slot<T>(): SlotMarker<T> {
  return {} as SlotMarker<T>
}

/**
 * Declares a named event kind with typed seed slots. The returned object
 * contains `keys` — typed accessors for reading seed values from context —
 * and is passed to `ctx.seed(kind, seeds)` or `createEventContext()`.
 *
 * @param name - Unique event kind name (e.g. `'http'`, `'cli'`, `'workflow'`)
 * @param schema - Object mapping slot names to `slot<T>()` markers
 * @returns An `EventKind` with typed `keys` for context access
 *
 * @example
 * ```ts
 * const httpKind = defineEventKind('http', {
 *   req: slot<IncomingMessage>(),
 *   response: slot<HttpResponse>(),
 * })
 *
 * // Access typed seed values:
 * const req = ctx.get(httpKind.keys.req) // IncomingMessage
 * ```
 */
export function defineEventKind<S extends Record<string, SlotMarker<any>>>(
  name: string,
  schema: S,
): EventKind<S> {
  const keys = {} as EventKind<S>['keys']
  const _entries: Array<[string, Key<unknown>]> = []
  for (const prop of Object.keys(schema)) {
    const k = key(`${name}.${prop}`)
    ;(keys as Record<string, unknown>)[prop] = k
    _entries.push([prop, k])
  }
  return { name, keys, _entries }
}
