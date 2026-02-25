import { randomUUID } from 'node:crypto'
import { cached } from './key'
import { current } from './storage'
import { routeParamsKey } from './keys'
import type { EventContext } from './context'

const eventIdSlot = cached(() => randomUUID())

/**
 * Returns the route parameters for the current event. Works with HTTP
 * routes, CLI commands, workflow steps — any adapter that sets `routeParamsKey`.
 *
 * @param ctx - Optional explicit context (defaults to `current()`)
 * @returns Object with `params` (the full params record) and `get(name)` for typed access
 *
 * @example
 * ```ts
 * app.get('/users/:id', () => {
 *   const { params, get } = useRouteParams<{ id: string }>()
 *   console.log(get('id')) // typed as string
 * })
 * ```
 */
export function useRouteParams<
  T extends Record<string, string | string[]> = Record<string, string | string[]>,
>(ctx?: EventContext): { params: T; get: <K extends keyof T>(name: K) => T[K] } {
  const c = ctx ?? current()
  const params = c.get(routeParamsKey) as T
  return {
    params,
    get: <K extends keyof T>(name: K) => params[name],
  }
}

/**
 * Provides a unique, per-event identifier. The ID is a random UUID, generated
 * lazily on first `getId()` call and cached for the event lifetime.
 *
 * @param ctx - Optional explicit context (defaults to `current()`)
 *
 * @example
 * ```ts
 * const { getId } = useEventId()
 * logger.info(`Request ${getId()}`)
 * ```
 */
export function useEventId(ctx?: EventContext): { getId: () => string } {
  const c = ctx ?? current()
  return {
    getId: () => c.get(eventIdSlot),
  }
}
