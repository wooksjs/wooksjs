import type { EventContext } from './context'
import type { Key, Cached } from './types'

const COUNTER_KEY = Symbol.for('wooks.core.keyCounter')

interface SlotIdCounter {
  next: number
}

/**
 * Slot ids are handed out from a counter living on `globalThis`.
 *
 * Two copies of `@wooksjs/event-core` loaded side by side share a single
 * `AsyncLocalStorage` (see `./storage`), and `EventContext.slots` is keyed by
 * the numeric `_id`. A module-scoped counter would restart at `0` in the
 * second copy, so its slots would collide with unrelated slots of the first
 * one and silently read/overwrite each other's values. A global counter keeps
 * ids unique across every loaded copy.
 */
const _g = globalThis as Record<symbol, unknown>
if (!_g[COUNTER_KEY]) {
  _g[COUNTER_KEY] = { next: 0 } as SlotIdCounter
}
const counter = _g[COUNTER_KEY] as SlotIdCounter

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
  return { _id: counter.next++, _name: name } as Key<T>
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
  const id = counter.next++
  return { _id: id, _name: `cached:${id}`, _fn: fn } as Cached<T>
}

/** @internal Returns true if the accessor is a `Cached` slot (has a factory function). */
export function isCached<T>(accessor: Key<T> | Cached<T>): accessor is Cached<T> {
  return '_fn' in accessor
}
