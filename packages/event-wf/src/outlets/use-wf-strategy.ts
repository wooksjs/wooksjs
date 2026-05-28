import { defineWook } from '@wooksjs/event-core'
import type { EventContext } from '@wooksjs/event-core'

import {
  stateStrategyKey,
  stateStrategyNameKey,
  strategyRegistryKey,
} from './outlet-context'

/**
 * Composable for inspecting / swapping the active state strategy from within
 * a workflow step. The new strategy applies to the NEXT pause's token —
 * subsequent resumes use it because the strategy name is embedded in the token.
 *
 * @example
 * ```ts
 * // Step that escalates from in-memory state to a durable KV store before
 * // pausing for a long-running approval:
 * app.step('await-approval', {
 *   handler: () => {
 *     swapStrategy('kv')
 *     return outletHttp({ fields: ['decision'] })
 *   },
 * })
 * ```
 */
export const useWfStrategy = defineWook((ctx: EventContext) => ({
  /** Name of the strategy currently set for the next persist. */
  current: () => ctx.get(stateStrategyNameKey),
  /**
   * Swap the active strategy by name. Throws if the name is not in the
   * registry configured on the trigger.
   */
  swap: (name: string) => {
    const registry = ctx.get(strategyRegistryKey)
    const strategy = registry?.[name]
    if (!strategy) {
      const known = registry ? Object.keys(registry).join(', ') : '(none registered)'
      throw new Error(`swapStrategy: unknown strategy '${name}'. Known: ${known}`)
    }
    ctx.set(stateStrategyKey, strategy)
    ctx.set(stateStrategyNameKey, name)
  },
}))

/**
 * Sugar — calls `useWfStrategy().swap(name)`. Returns `undefined` so a step
 * can write `return swapStrategy('kv')` when no outlet pause follows.
 */
export function swapStrategy(name: string): undefined {
  useWfStrategy().swap(name)
  return undefined
}
