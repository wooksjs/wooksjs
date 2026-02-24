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

export function run<R>(ctx: EventContext, fn: () => R): R {
  return storage.run(ctx, fn)
}

export function current(): EventContext {
  const ctx = storage.getStore()
  if (!ctx) {
    throw new Error('[Wooks] No active event context')
  }
  return ctx
}

export function tryGetCurrent(): EventContext | undefined {
  return storage.getStore()
}

export function useLogger(ctx?: EventContext): Logger {
  return (ctx ?? current()).logger
}

export function createEventContext<R>(
  options: EventContextOptions,
  fn: () => R,
): R
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

  // attach seeds + eventTypeKey, then wrap callback in CI for observability
  return run(ctx, () => {
    ctx.attach(kindOrFn, seedsOrUndefined!)
    return getContextInjector().with('Event:start', { eventType: kindOrFn.name }, maybeFn!)
  })
}
