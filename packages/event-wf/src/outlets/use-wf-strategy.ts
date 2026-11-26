import type { EventContext } from '@wooksjs/event-core'

import { defineWfWook, isRunContext } from '../run-context'
import { STRATEGY_NAME_RE, renewStateTokenKey, stateStrategyNameKey } from '../strategy-context'

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
export const useWfStrategy = defineWfWook((ctx: EventContext) => {
  // `ctx` is the innermost run around the caller (see defineWfWook) — or, outside any run, the
  // current context, where every method throws. Per-run state is written with `setOwn`.
  const inRun = (caller: string): EventContext => {
    if (!isRunContext(ctx)) {
      throw new Error(`${caller}: call it inside a workflow step`)
    }
    return ctx
  }
  return {
    /** Name of the strategy currently set for the next persist. Throws outside a workflow run. */
    current: () => inRun('useWfStrategy().current()').getOwn(stateStrategyNameKey),
    /**
     * Swap the active strategy by name. Validates name format only; unknown
     * names surface as a loud error at pause time from the trigger. Throws outside a workflow run.
     */
    swap: (name: string) => {
      if (!STRATEGY_NAME_RE.test(name)) {
        throw new Error(`swapStrategy: invalid name '${name}' — must match ${STRATEGY_NAME_RE}`)
      }
      inRun('swapStrategy').setOwn(stateStrategyNameKey, name)
    },
    /**
     * Continue under a NEW state token from the pause that ends this run — see
     * {@link renewStateToken}. Throws outside a workflow run.
     */
    renewToken: () => {
      inRun('renewStateToken').setOwn(renewStateTokenKey, true)
    },
  }
})

/**
 * Sugar — calls `useWfStrategy().swap(name)`. Returns `undefined` so a step
 * can write `return swapStrategy('kv')` when no outlet pause follows.
 */
export function swapStrategy(name: string): undefined {
  useWfStrategy().swap(name)
  return undefined
}

/**
 * Continue the workflow under a NEW state token from the pause that ends this run — for a step
 * that raises the privilege of whoever holds the token (e.g. the user just set a password on an
 * invitation delivered by email). The token the run was resumed with (in an email, a URL, the
 * browser history) can no longer continue the flow: it answers 410 `WF_EXPIRED`. The new token
 * is delivered like any pause's (body `wfs` or cookie, per `token.write`); later pauses re-use
 * it as usual.
 *
 * - Handle strategies (`HandleStateStrategy`): the pause is persisted under a freshly minted
 *   handle instead of the incoming one, which the resume already consumed.
 * - `EncapsulatedStateStrategy`: no effect — every pause already gets a new token, and an old
 *   one stays valid until it expires (it carries its own state); guard replays in the step.
 * - The run finishes without pausing, or is a start (no incoming token): no effect.
 * - A request that fails discards the new state (its token never reached the client); under
 *   `restoreOnError` the old state is restored under the old token, the one to retry.
 *
 * Returns `undefined` so a step can write `return renewStateToken()`. Throws outside a
 * workflow run (e.g. in an HTTP handler).
 *
 * @example
 * ```ts
 * app.step('set-password', {
 *   handler: async () => {
 *     await savePassword(useWfState().input<{ password: string }>()!.password)
 *     renewStateToken() // the emailed invite link stops working from the next pause on
 *   },
 * })
 * ```
 */
export function renewStateToken(): undefined {
  useWfStrategy().renewToken()
  return undefined
}
