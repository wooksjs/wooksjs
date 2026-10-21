import type { TFlowOutput } from '@prostojs/wf'
import { mintWfStateToken } from '@prostojs/wf/outlets'

import type { WfPauseRequest } from '../pause-request'

import { createResolver } from './access'
import {
  defaultStrategy,
  normalizeStateConfig,
  pauseMeta,
  pauseStrategy,
  wrapToken,
} from './state-config'
import type { WfOutletTriggerConfig, WfStartRunner } from './types'

/** Options for {@link mintWfToken}. */
export interface WfMintTokenOptions {
  /** Workflow to start — as a trigger's `wfid`. */
  wfid: string
  /** Initial workflow context (default `{}`). */
  context?: unknown
  /** Input for the first step. */
  input?: unknown
  /**
   * The SAME `state` config as the trigger that will resume the token (a strategy, or
   * `{ strategies, default }`): the token is `<strategy>.<handle>` for that registry.
   */
  state: WfOutletTriggerConfig['state']
  /**
   * Token lifetime in **milliseconds** (`0` = never expires). When the pausing step also returns
   * `expires`, the earlier one wins; with neither, the strategy's `defaultTtl` applies.
   */
  ttl?: number
  /**
   * Extra `state.meta` to persist, kept on every later pause the trigger persists. Keys the
   * trigger or the strategies own (`outlet`, `restores`, `__wf*`) are dropped.
   */
  meta?: Record<string, unknown>
  /** Parent event context for the run (e.g. the current request, so steps can read it). */
  eventContext?: unknown
}

/** Result of {@link mintWfToken}. */
export interface WfMintTokenResult {
  /** `<strategy>.<handle>` — resumable through the trigger; `undefined` if the flow did not pause. */
  token: string | undefined
  /** What the paused step asked for (deliver the token through it yourself). */
  inputRequired: WfPauseRequest | undefined
  /** Absolute expiry (ms timestamp), `0` = never; `undefined` when unknown or not paused. */
  expiresAt: number | undefined
  output: TFlowOutput<unknown, unknown, WfPauseRequest>
}

/**
 * Starts a workflow **without a request** and persists its first pause exactly as the outlet
 * trigger would, returning a token the trigger resumes: the headless half of the trigger, for
 * server-initiated flows (invites, approval links, scheduled reminders).
 *
 * The token uses the trigger's conventions — `<strategy>.<handle>` for the `state` registry
 * (honouring `swapStrategy()` in the first steps), `state.meta.outlet`, expiry tracking — so
 * resume, `allow`/`block`, `restoreOnError` and expiry behave as for a token the trigger issued.
 * No outlet is called: deliver the token yourself (`inputRequired` says how the flow asked).
 * `allow`/`block` are not checked here (the server chooses the flow); they apply on resume.
 *
 * @param wf - Anything with the trigger deps' `start()` (`WooksWf`, `MoostWf`), plus optional
 *   `resolveSchemaId()` (needed only when the default-strategy picker reads the flow id).
 *
 * @example
 * ```ts
 * const { token } = await mintWfToken(wfApp, {
 *   wfid: 'invite',
 *   context: { email },
 *   state: triggerConfig.state,
 *   ttl: 7 * 24 * 3600_000,
 * })
 * if (token) await sendInvite(email, `https://app.example/invite?wfs=${token}`)
 * ```
 */
export async function mintWfToken(
  wf: WfStartRunner,
  options: WfMintTokenOptions,
): Promise<WfMintTokenResult> {
  const { wfid, eventContext } = options
  const stateConfig = normalizeStateConfig(options.state)
  // the trigger's resolution: a throwing resolveSchemaId counts as unresolved (flow id = wfid)
  const resolve = stateConfig.defaultUsesFlowId ? createResolver(wf, eventContext) : undefined
  const flowId = (resolve && (await resolve(wfid))) ?? wfid
  const startName = defaultStrategy(stateConfig, wfid, flowId)
  let finalName = startName

  const result = await mintWfStateToken<unknown, WfPauseRequest>(
    {
      start: (schemaId, context, input) =>
        wf.start.call(wf, schemaId, context, {
          input,
          eventContext,
          strategy: { name: startName },
        }),
    },
    {
      schemaId: wfid,
      context: options.context ?? {},
      input: options.input,
      ttl: options.ttl,
      strategy: (pause) => {
        const picked = pauseStrategy(stateConfig.registry, pause)
        finalName = picked.name
        return picked.strategy
      },
      meta: ({ inputRequired }) => pauseMeta(inputRequired.outlet, 0, options.meta),
    },
  )
  return {
    ...result,
    token: result.token === undefined ? undefined : wrapToken(finalName, result.token),
  }
}
