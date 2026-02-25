import { AsyncLocalStorage } from 'node:async_hooks'
import { EventContext } from './context'
import type { EventContextOptions } from './context'
import { getContextInjector } from './context-injector'
import type { EventKind, EventKindSeeds, Logger } from './types'

const STORAGE_KEY = Symbol.for('wooks.core.asyncStorage')
const VERSION_KEY = Symbol.for('wooks.core.asyncStorage.version')
const CURRENT_VERSION = __VERSION__

const _g = globalThis as Record<symbol, unknown>
if (_g[STORAGE_KEY]) {
  if (_g[VERSION_KEY] !== CURRENT_VERSION) {
    throw new Error(
      `[wooks] Incompatible versions of @wooksjs/event-core detected: ` +
        `existing v${_g[VERSION_KEY] as string}, loading v${CURRENT_VERSION}. ` +
        `All packages must use the same @wooksjs/event-core version.`,
    )
  }
} else {
  _g[STORAGE_KEY] = new AsyncLocalStorage<EventContext>()
  _g[VERSION_KEY] = CURRENT_VERSION
}

const storage = _g[STORAGE_KEY] as AsyncLocalStorage<EventContext>

/**
 * Runs a callback with the given `EventContext` as the active context.
 * All composables and `current()` calls inside `fn` will resolve to `ctx`.
 *
 * @param ctx - The event context to make active
 * @param fn - Callback to execute within the context scope
 * @returns The return value of `fn`
 *
 * @example
 * ```ts
 * const ctx = new EventContext({ logger })
 * run(ctx, () => {
 *   // current() returns ctx here
 *   const logger = useLogger()
 * })
 * ```
 */
export function run<R>(ctx: EventContext, fn: () => R): R {
  return storage.run(ctx, fn)
}

/**
 * Returns the active `EventContext` for the current async scope.
 * Throws if called outside an event context (e.g., at module level).
 *
 * All composables use this internally. Prefer composables over direct `current()` access.
 *
 * @throws Error if no active event context exists
 */
export function current(): EventContext {
  const ctx = storage.getStore()
  if (!ctx) {
    throw new Error('[Wooks] No active event context')
  }
  return ctx
}

/**
 * Returns the active `EventContext`, or `undefined` if none is active.
 * Use this when context availability is uncertain (e.g., in code that may
 * run both inside and outside an event handler).
 */
export function tryGetCurrent(): EventContext | undefined {
  return storage.getStore()
}

/**
 * Returns the logger for the current event context.
 *
 * @param ctx - Optional explicit context (defaults to `current()`)
 *
 * @example
 * ```ts
 * const logger = useLogger()
 * logger.info('Processing request')
 * ```
 */
export function useLogger(ctx?: EventContext): Logger {
  return (ctx ?? current()).logger
}

/**
 * Creates a new `EventContext`, makes it the active context via
 * `AsyncLocalStorage`, and runs `fn` inside it.
 *
 * @param options - Context options (must include `logger`)
 * @param fn - Callback to execute within the new context
 * @returns The return value of `fn`
 *
 * @example
 * ```ts
 * createEventContext({ logger }, () => {
 *   // composables work here
 * })
 * ```
 */
export function createEventContext<R>(options: EventContextOptions, fn: () => R): R
/**
 * Creates a new `EventContext` with an event kind, seeds the kind's slots,
 * and runs `fn` inside the context.
 *
 * @param options - Context options (must include `logger`)
 * @param kind - Event kind (from `defineEventKind`)
 * @param seeds - Seed values for the event kind's slots
 * @param fn - Callback to execute within the new context
 * @returns The return value of `fn`
 *
 * @example
 * ```ts
 * const httpKind = defineEventKind('http', { req: slot<IncomingMessage>() })
 *
 * createEventContext({ logger }, httpKind, { req: incomingMessage }, () => {
 *   const req = current().get(httpKind.keys.req)
 * })
 * ```
 */
export function createEventContext<S extends Record<string, any>, R>(
  options: EventContextOptions,
  kind: EventKind<S>,
  seeds: EventKindSeeds<EventKind<S>>,
  fn: () => R,
): R
export function createEventContext(
  options: EventContextOptions,
  kindOrFn: EventKind<any> | (() => unknown),
  seedsOrUndefined?: EventKindSeeds<any>,
  maybeFn?: () => unknown,
): unknown {
  const ctx = new EventContext(options)

  if (typeof kindOrFn === 'function') {
    return run(ctx, kindOrFn)
  }

  // seed slots + eventTypeKey, then wrap callback in CI for observability
  return run(ctx, () => {
    ctx.seed(kindOrFn, seedsOrUndefined!)
    return getContextInjector().with('Event:start', { eventType: kindOrFn.name }, maybeFn!)
  })
}
