import { AsyncLocalStorage } from 'node:async_hooks'
import { EventContext } from './context'
import type { EventContextOptions } from './context'
import { getContextInjector } from './context-injector'
import type { EventKind, EventKindSeeds, Logger } from './types'

const STORAGE_KEY = Symbol.for('wooks.core.asyncStorage')
const VERSION_KEY = Symbol.for('wooks.core.asyncStorage.version')
const PATH_KEY = Symbol.for('wooks.core.asyncStorage.path')
const CURRENT_VERSION = __VERSION__

/** @internal Identity of one loaded copy of `@wooksjs/event-core`. */
export interface CoreCopyIdentity {
  version: string
  path?: string
}

function describePath(path: unknown): string {
  return typeof path === 'string' && path ? path : 'unknown path'
}

/**
 * Registers this copy of `@wooksjs/event-core` on the global object and
 * returns the shared `AsyncLocalStorage`.
 *
 * A different version throws — the context layout is not compatible. The same
 * version is survivable (both copies then share one storage), but it still
 * means the bundler resolved the runtime twice, so we warn: the packages built
 * on top of event-core are duplicated too, and their slots do not cross over.
 *
 * @internal Exported for tests; invoked once at module scope.
 */
export function registerCoreCopy(
  identity: CoreCopyIdentity,
  globalObject: object = globalThis,
): AsyncLocalStorage<EventContext> {
  const holder = globalObject as Record<symbol, unknown>
  const existing = holder[STORAGE_KEY] as AsyncLocalStorage<EventContext> | undefined
  if (!existing) {
    const storage = new AsyncLocalStorage<EventContext>()
    holder[STORAGE_KEY] = storage
    holder[VERSION_KEY] = identity.version
    holder[PATH_KEY] = identity.path
    return storage
  }
  if (holder[VERSION_KEY] !== identity.version) {
    throw new Error(
      `[wooks] Incompatible versions of @wooksjs/event-core detected: ` +
        `existing v${holder[VERSION_KEY] as string}, loading v${identity.version}. ` +
        `All packages must use the same @wooksjs/event-core version.`,
    )
  }
  // oxlint-disable-next-line no-console -- fires at module load, before any logger exists
  console.warn(
    `[wooks] A second copy of @wooksjs/event-core v${identity.version} was loaded ` +
      `(first: ${describePath(holder[PATH_KEY])}, now: ${describePath(identity.path)}). ` +
      'The copies share the event-context storage, but packages built on them ' +
      '(@wooksjs/event-http, moost, …) are most likely duplicated too, and a slot seeded ' +
      'by one copy is invisible to composables from the other — typical symptom: ' +
      '"Cannot read properties of undefined (reading \'headers\')". Make your bundler ' +
      'resolve the whole wooks/moost runtime once: either bundle it entirely or keep it ' +
      'entirely external, together with every package that depends on it.',
  )
  return existing
}

const storage = registerCoreCopy({
  version: CURRENT_VERSION,
  // `typeof` is safe on the undeclared `__filename` in ESM; in the CJS
  // bundle it is defined and wins (rolldown shims `import.meta.url` there)
  path: typeof __filename === 'string' ? __filename : import.meta.url,
})

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
 * When called with a `topic` string, creates a child logger via
 * `logger.createTopic()` (if supported). Falls back to the base
 * logger when `createTopic` is not available.
 *
 * @example
 * ```ts
 * const logger = useLogger()
 * logger.info('Processing request')
 *
 * const scoped = useLogger('auth')
 * scoped.warn('Token expired')
 * ```
 */
export function useLogger(): Logger
export function useLogger(topic: string): Logger
export function useLogger(ctx: EventContext): Logger
export function useLogger(topic: string, ctx: EventContext): Logger
export function useLogger(topicOrCtx?: string | EventContext, maybeCtx?: EventContext): Logger {
  const ctx = (typeof topicOrCtx === 'string' ? maybeCtx : topicOrCtx) ?? current()
  const logger = ctx.logger
  if (typeof topicOrCtx === 'string' && logger.createTopic) {
    return logger.createTopic(topicOrCtx)
  }
  return logger
}

/**
 * Creates a new `EventContext`, makes it the active context via
 * `AsyncLocalStorage`, and runs `fn` inside it.
 *
 * @param options - Context options (must include `logger`)
 * @param fn - Callback to execute within the new context
 * @returns The return value of `fn`
 *
 * The kindless overload is a convenience for tests that need a context scope
 * without declaring an event kind. Production code should always provide a kind.
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
    const ci = getContextInjector()
    return ci ? ci.with('Event:start', { eventType: kindOrFn.name }, maybeFn!) : maybeFn!()
  })
}
