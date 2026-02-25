import { cached } from './key'
import { current } from './storage'
import type { EventContext } from './context'

/**
 * Creates a composable with per-event caching. The factory runs once per
 * `EventContext`; subsequent calls within the same event return the cached result.
 *
 * This is the recommended way to build composables in Wooks. All built-in
 * composables (`useRequest`, `useResponse`, `useCookies`, etc.) are created with `defineWook`.
 *
 * @param factory - Receives the `EventContext` and returns the composable's public API
 * @returns A composable function `(ctx?: EventContext) => T`
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
export function defineWook<T>(factory: (ctx: EventContext) => T): (ctx?: EventContext) => T {
  const slot = cached(factory)
  return (ctx?) => (ctx ?? current()).get(slot)
}
