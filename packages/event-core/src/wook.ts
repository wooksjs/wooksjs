import { cached } from './key'
import { current } from './storage'
import type { Cached } from './types'
import type { EventContext } from './context'

/**
 * A composable function created by {@link defineWook}. Callable as `(ctx?) => T`,
 * with an exposed `_slot` for advanced use cases such as slot isolation in child contexts.
 */
export interface WookComposable<T> {
  (ctx?: EventContext): T
  /** The underlying `Cached` slot. Useful for building isolation lists in child contexts. */
  readonly _slot: Cached<T>
}

/**
 * Creates a composable with per-event caching. The factory runs once per
 * `EventContext`; subsequent calls within the same event return the cached result.
 *
 * This is the recommended way to build composables in Wooks. All built-in
 * composables (`useRequest`, `useResponse`, `useCookies`, etc.) are created with `defineWook`.
 *
 * @param factory - Receives the `EventContext` and returns the composable's public API
 * @returns A composable function with an exposed `_slot` for isolation
 *
 * @example
 * ```ts
 * export const useCurrentUser = defineWook((ctx) => {
 *   const { basicCredentials } = useAuthorization(ctx)
 *   const username = basicCredentials()?.username
 *   return {
 *     username,
 *     profile: async () => username ? await db.findUser(username) : null,
 *   }
 * })
 *
 * // In a handler — factory runs once, cached for the request:
 * const { username, profile } = useCurrentUser()
 * ```
 */
export function defineWook<T>(factory: (ctx: EventContext) => T): WookComposable<T> {
  const _slot = cached(factory)
  return Object.assign(
    ((ctx?: EventContext) => (ctx ?? current()).get(_slot)) as WookComposable<T>,
    { _slot },
  )
}
