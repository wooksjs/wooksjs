import type { EventContext } from './context'
import type { Key, Cached } from './types'

let nextId = 0

/**
 * Creates a typed, writable context slot. Use `ctx.set(k, value)` to store
 * and `ctx.get(k)` to retrieve. Throws if read before being set.
 *
 * @param name - Debug label (shown in error messages, not used for lookup)
 *
 * @example
 * ```ts
 * const userIdKey = key<string>('userId')
 * ctx.set(userIdKey, '123')
 * ctx.get(userIdKey) // '123'
 * ```
 */
export function key<T>(name: string): Key<T> {
  return { _id: nextId++, _name: name } as Key<T>
}

/**
 * Creates a lazily-computed, read-only context slot. The factory runs once
 * per `EventContext` on first `ctx.get(slot)` call; the result is cached
 * for the context lifetime. Errors are also cached and re-thrown.
 *
 * @param fn - Factory receiving the current `EventContext`, returning the value to cache
 *
 * @example
 * ```ts
 * const parsedUrl = cached((ctx) => new URL(ctx.get(rawUrlKey)))
 * // first call computes, subsequent calls return cached result
 * ctx.get(parsedUrl)
 * ```
 */
export function cached<T>(fn: (ctx: EventContext) => T): Cached<T> {
  return { _id: nextId++, _name: `cached:${nextId}`, _fn: fn } as Cached<T>
}

/** @internal Returns true if the accessor is a `Cached` slot (has a factory function). */
export function isCached<T>(accessor: Key<T> | Cached<T>): accessor is Cached<T> {
  return '_fn' in accessor
}
