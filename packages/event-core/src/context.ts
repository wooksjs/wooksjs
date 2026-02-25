import type { Accessor, Cached, EventKind, EventKindSeeds, Key, Logger } from './types'
import { isCached } from './key'
import { eventTypeKey } from './keys'

const COMPUTING = Symbol('computing')
const UNDEFINED = Symbol('undefined')

class CachedError {
  constructor(public readonly error: unknown) {}
}

/** Options for creating an {@link EventContext}. */
export interface EventContextOptions {
  /** Logger instance available to all composables via `useLogger()`. */
  logger: Logger
}

/**
 * Per-event container for typed slots, propagated via `AsyncLocalStorage`.
 * Composables read and write data through `get`/`set` using typed `Key` or `Cached` accessors.
 *
 * Typically created by adapters (HTTP, CLI, etc.) — application code
 * interacts with it indirectly through composables.
 *
 * @example
 * ```ts
 * const ctx = new EventContext({ logger })
 * ctx.set(userIdKey, '123')
 * ctx.get(userIdKey) // '123'
 * ```
 */
export class EventContext {
  /** Logger instance for this event. */
  readonly logger: Logger
  private slots = new Map<number, unknown>()

  constructor(options: EventContextOptions) {
    this.logger = options.logger
  }

  /**
   * Reads a value from a typed slot.
   * - For `Key<T>`: returns the previously `set` value, or throws if not set.
   * - For `Cached<T>`: runs the factory on first access, caches and returns the result.
   *   Throws on circular dependencies. Errors are cached and re-thrown on subsequent access.
   */
  get<T>(accessor: Key<T> | Cached<T>): T {
    const id = accessor._id
    const val = this.slots.get(id)

    if (val !== undefined) {
      if (val === COMPUTING) {
        throw new Error(`Circular dependency detected for "${accessor._name}"`)
      }
      if (val instanceof CachedError) {
        throw val.error
      }
      if (val === UNDEFINED) return undefined as T
      return val as T
    }

    // val is undefined → slot was never set
    if (isCached(accessor)) {
      this.slots.set(id, COMPUTING)
      try {
        const result = accessor._fn(this)
        this.slots.set(id, result === undefined ? UNDEFINED : result)
        return result
      } catch (e) {
        this.slots.set(id, new CachedError(e))
        throw e
      }
    }

    throw new Error(`Key "${accessor._name}" is not set`)
  }

  /**
   * Writes a value to a typed slot. Overwrites any previous value (including cached results).
   */
  set<T>(key: Key<T> | Cached<T>, value: T): void {
    this.slots.set(key._id, value === undefined ? UNDEFINED : value)
  }

  /**
   * Returns `true` if the slot has been set or computed (not in a computing state).
   */
  has(accessor: Accessor<any>): boolean {
    const val = this.slots.get(accessor._id)
    return val !== undefined && val !== COMPUTING
  }

  /**
   * Seeds an event kind's slots into this context. Sets the event type key
   * and populates all slots declared in the kind's schema.
   *
   * @param kind - The event kind (from `defineEventKind`)
   * @param seeds - Values for each slot in the kind's schema
   * @param fn - Optional callback to run after attaching (returned value is forwarded)
   */
  attach<S extends Record<string, any>>(
    kind: EventKind<S>,
    seeds: EventKindSeeds<EventKind<S>>,
  ): void
  attach<S extends Record<string, any>, R>(
    kind: EventKind<S>,
    seeds: EventKindSeeds<EventKind<S>>,
    fn: () => R,
  ): R
  attach<S extends Record<string, any>, R>(
    kind: EventKind<S>,
    seeds: EventKindSeeds<EventKind<S>>,
    fn?: () => R,
  ): R | void {
    const entries = kind._entries
    for (const [prop, k] of entries) {
      const v = (seeds as Record<string, unknown>)[prop]
      this.slots.set(k._id, v === undefined ? UNDEFINED : v)
    }
    this.set(eventTypeKey, kind.name)

    if (fn) {
      return fn()
    }
  }
}
