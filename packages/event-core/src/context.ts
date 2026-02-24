import type { Accessor, Cached, EventKind, EventKindSeeds, Key, Logger } from './types'
import { isCached } from './key'
import { eventTypeKey } from './keys'

const COMPUTING = Symbol('computing')
const UNDEFINED = Symbol('undefined')

class CachedError {
  constructor(public readonly error: unknown) {}
}

export interface EventContextOptions {
  logger: Logger
}

export class EventContext {
  readonly logger: Logger
  private slots = new Map<number, unknown>()

  constructor(options: EventContextOptions) {
    this.logger = options.logger
  }

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

  set<T>(key: Key<T> | Cached<T>, value: T): void {
    this.slots.set(key._id, value === undefined ? UNDEFINED : value)
  }

  has(accessor: Accessor<any>): boolean {
    const val = this.slots.get(accessor._id)
    return val !== undefined && val !== COMPUTING
  }

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
