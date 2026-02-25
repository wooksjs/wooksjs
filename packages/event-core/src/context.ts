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
  /** Optional parent context. Enables transparent read-through and scoped writes. */
  parent?: EventContext
}

/**
 * Per-event container for typed slots, propagated via `AsyncLocalStorage`.
 * Composables read and write data through `get`/`set` using typed `Key` or `Cached` accessors.
 *
 * Supports a parent chain: when a slot is not found locally, `get()` traverses
 * parent contexts. `set()` writes to the nearest context that already holds the slot,
 * or locally if the slot is new.
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
  /** Parent context for read-through and scoped writes. */
  readonly parent?: EventContext
  private slots = new Map<number, unknown>()

  constructor(options: EventContextOptions) {
    this.logger = options.logger
    this.parent = options.parent
  }

  /**
   * Reads a value from a typed slot.
   * - For `Key<T>`: returns the previously `set` value, checking parent chain if not found locally.
   * - For `Cached<T>`: returns a cached result from this context or any parent. If not found
   *   anywhere, runs the factory on first access, caches locally, and returns the result.
   *   Throws on circular dependencies. Errors are cached and re-thrown on subsequent access.
   */
  get<T>(accessor: Key<T> | Cached<T>): T {
    const id = accessor._id
    let val = this.slots.get(id)

    // Try parent chain if not found locally
    if (val === undefined && this.parent) {
      val = this.parent._findSlot(id)
    }

    if (val !== undefined) {
      if (val === COMPUTING) {
        throw new Error(`Circular dependency detected for "${accessor._name}"`)
      }
      if (val instanceof CachedError) {
        throw val.error
      }
      if (val === UNDEFINED) {
        return undefined as T
      }
      return val as T
    }

    // Not found anywhere in the chain — compute if Cached, else throw
    if (isCached(accessor)) {
      this.slots.set(id, COMPUTING)
      try {
        const result = accessor._fn(this)
        this.slots.set(id, result === undefined ? UNDEFINED : result)
        return result
      } catch (error) {
        this.slots.set(id, new CachedError(error))
        throw error
      }
    }

    throw new Error(`Key "${accessor._name}" is not set`)
  }

  /**
   * Writes a value to a typed slot. If the slot already exists somewhere in the
   * parent chain, the value is written there. Otherwise, it is written locally.
   */
  set<T>(key: Key<T> | Cached<T>, value: T): void {
    const encoded = value === undefined ? UNDEFINED : value
    // Exists locally — write here
    if (this.slots.has(key._id)) {
      this.slots.set(key._id, encoded)
      return
    }
    // Try to write to a parent that has it
    if (this.parent && this.parent._setIfExists(key._id, encoded)) {
      return
    }
    // Not found in chain — write locally
    this.slots.set(key._id, encoded)
  }

  /**
   * Returns `true` if the slot has been set or computed in this context or any parent.
   */
  has(accessor: Accessor<any>): boolean {
    const val = this.slots.get(accessor._id)
    if (val !== undefined && val !== COMPUTING) {
      return true
    }
    return this.parent?.has(accessor) ?? false
  }

  /**
   * Reads a value from a typed slot in this context only, ignoring parents.
   * Same semantics as `get()` but without parent chain traversal.
   */
  getOwn<T>(accessor: Key<T> | Cached<T>): T {
    const id = accessor._id
    const val = this.slots.get(id)

    if (val !== undefined) {
      if (val === COMPUTING) {
        throw new Error(`Circular dependency detected for "${accessor._name}"`)
      }
      if (val instanceof CachedError) {
        throw val.error
      }
      if (val === UNDEFINED) {
        return undefined as T
      }
      return val as T
    }

    if (isCached(accessor)) {
      this.slots.set(id, COMPUTING)
      try {
        const result = accessor._fn(this)
        this.slots.set(id, result === undefined ? UNDEFINED : result)
        return result
      } catch (error) {
        this.slots.set(id, new CachedError(error))
        throw error
      }
    }

    throw new Error(`Key "${accessor._name}" is not set`)
  }

  /**
   * Writes a value to a typed slot in this context only, ignoring parents.
   */
  setOwn<T>(key: Key<T> | Cached<T>, value: T): void {
    this.slots.set(key._id, value === undefined ? UNDEFINED : value)
  }

  /**
   * Returns `true` if the slot has been set or computed in this context only.
   */
  hasOwn(accessor: Accessor<any>): boolean {
    const val = this.slots.get(accessor._id)
    return val !== undefined && val !== COMPUTING
  }

  /**
   * Seeds an event kind's slots into this context. Sets the event type key
   * and populates all slots declared in the kind's schema.
   *
   * @param kind - The event kind (from `defineEventKind`)
   * @param seeds - Values for each slot in the kind's schema
   * @param fn - Optional callback to run after seeding (returned value is forwarded)
   */
  seed<S extends Record<string, any>>(kind: EventKind<S>, seeds: EventKindSeeds<EventKind<S>>): void
  seed<S extends Record<string, any>, R>(
    kind: EventKind<S>,
    seeds: EventKindSeeds<EventKind<S>>,
    fn: () => R,
  ): R
  seed<S extends Record<string, any>, R>(
    kind: EventKind<S>,
    seeds: EventKindSeeds<EventKind<S>>,
    fn?: () => R,
  ): R | void {
    const entries = kind._entries
    for (const [prop, k] of entries) {
      const v = (seeds as Record<string, unknown>)[prop]
      this.slots.set(k._id, v === undefined ? UNDEFINED : v)
    }
    this.setOwn(eventTypeKey, kind.name)

    if (fn) {
      return fn()
    }
  }

  /** Walk the parent chain looking for a set slot. Returns `undefined` if not found. */
  private _findSlot(id: number): unknown {
    const val = this.slots.get(id)
    if (val !== undefined) {
      return val
    }
    return this.parent?._findSlot(id)
  }

  /** Set value in the first context in the chain that has this slot. Returns true if found. */
  private _setIfExists(id: number, encoded: unknown): boolean {
    if (this.slots.has(id)) {
      this.slots.set(id, encoded)
      return true
    }
    return this.parent?._setIfExists(id, encoded) ?? false
  }
}
