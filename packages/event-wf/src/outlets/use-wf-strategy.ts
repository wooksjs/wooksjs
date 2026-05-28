import { defineWook } from '@wooksjs/event-core'
import type { EventContext } from '@wooksjs/event-core'

import { STRATEGY_NAME_RE, stateStrategyNameKey } from '../strategy-context'

/**
 * Composable for inspecting / swapping the active state strategy name from
 * within a workflow step. The new name applies to the NEXT pause — it travels
 * back to the outlet trigger via `output.inputRequired.stateStrategy`, and
 * persists in the issued token's prefix.
 *
 * The composable only validates the name FORMAT (regex). Existence in the
 * trigger's strategy registry is validated at pause time by the trigger
 * itself — `swapStrategy('typo')` here will not throw; the trigger will
 * throw on pause when it can't find 'typo' in its registry.
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
   * Swap the active strategy by name. Validates name format only; unknown
   * names surface as a loud error at pause time from the trigger.
   */
  swap: (name: string) => {
    if (!STRATEGY_NAME_RE.test(name)) {
      throw new Error(`swapStrategy: invalid name '${name}' — must match ${STRATEGY_NAME_RE}`)
    }
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
