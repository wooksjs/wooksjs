import type { WfState, WfStateStrategy } from '@prostojs/wf/outlets'

import type { WfPauseRequest } from '../pause-request'
import { STRATEGY_NAME_RE } from '../strategy-context'

import type { WfOutletTriggerConfig } from './types'

/*
 * Conventions shared by the outlet trigger and `mintWfToken`, so a token minted headlessly
 * resumes through a trigger configured with the same `state`:
 *   - token = `<strategyName>.<raw handle>` (the strategy that persisted the state);
 *   - persisted `state.meta.outlet` = the outlet the flow paused on.
 */

/** `<strategy name>.<raw handle>` */
export function wrapToken(name: string, raw: string): string {
  return `${name}.${raw}`
}

export function unwrapToken(token: string): { name: string; raw: string } | null {
  const i = token.indexOf('.')
  if (i <= 0 || i === token.length - 1) {
    return null
  }
  return { name: token.slice(0, i), raw: token.slice(i + 1) }
}

/** Own-property lookup: prototype keys ('constructor') never resolve to a strategy. */
export function strategyByName(
  registry: Record<string, WfStateStrategy>,
  name: string,
): WfStateStrategy | undefined {
  return Object.prototype.hasOwnProperty.call(registry, name) ? registry[name] : undefined
}

export interface NormalizedStateConfig {
  registry: Record<string, WfStateStrategy>
  resolveDefaultName: (wfid: string, flowId: string) => string
  /** whether the default-strategy picker reads the flow id */
  defaultUsesFlowId: boolean
}

export function normalizeStateConfig(state: WfOutletTriggerConfig['state']): NormalizedStateConfig {
  if (typeof state === 'object' && state !== null && 'strategies' in state) {
    const registry = state.strategies
    for (const name of Object.keys(registry)) {
      if (!STRATEGY_NAME_RE.test(name)) {
        throw new Error(`Invalid strategy name '${name}': must match /^[A-Za-z0-9_-]+$/`)
      }
    }
    const def = state.default
    if (typeof def === 'function') {
      return { registry, resolveDefaultName: def, defaultUsesFlowId: true }
    }
    return { registry, resolveDefaultName: () => def, defaultUsesFlowId: false }
  }
  // Single-strategy shortcut → auto-promote to { default: state }
  return {
    registry: { default: state },
    resolveDefaultName: () => 'default',
    defaultUsesFlowId: false,
  }
}

/** The name of the strategy a flow starts on; throws when it is not registered. */
export function defaultStrategy(
  config: NormalizedStateConfig,
  wfid: string,
  flowId: string,
): string {
  const name = config.resolveDefaultName(wfid, flowId)
  if (!strategyByName(config.registry, name)) {
    throw new Error(
      `Default strategy '${name}' not found in registry. Known: ${Object.keys(config.registry).join(', ')}`,
    )
  }
  return name
}

/**
 * The strategy a pause is persisted with: the one the run ended on (`stateStrategy`, set by
 * the adapter on every pause, after any `swapStrategy()`). Throws on a missing or unknown name.
 */
export function pauseStrategy(
  registry: Record<string, WfStateStrategy>,
  pause: WfPauseRequest,
): { name: string; strategy: WfStateStrategy } {
  const name = pause.stateStrategy
  if (name === undefined) {
    throw new Error(
      'Workflow paused without `stateStrategy` on inputRequired — the WF adapter must augment the output with the active strategy name.',
    )
  }
  const strategy = strategyByName(registry, name)
  if (!strategy) {
    throw new Error(
      `Workflow paused with unknown strategy '${name}' — step swapped to a name not in the trigger's registry. Known: ${Object.keys(registry).join(', ')}`,
    )
  }
  return { name, strategy }
}

/**
 * `state.meta` keys the trigger (and the state strategies) own: `outlet`, `restores`, and any
 * `__wf*` key (e.g. the expiry envelope a strategy stores). Caller meta can never set them.
 */
function isOwnedMetaKey(key: string): boolean {
  return key === 'outlet' || key === 'restores' || key.startsWith('__wf')
}

/** Caller-supplied meta of a state, without trigger-owned keys (`undefined` when none is left). */
export function callerMeta(
  meta: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!meta) {
    return undefined
  }
  let out: Record<string, unknown> | undefined
  for (const key of Object.keys(meta)) {
    if (!isOwnedMetaKey(key)) {
      ;(out ??= {})[key] = meta[key]
    }
  }
  return out
}

/**
 * `state.meta` for a paused state: caller meta (kept from pause to pause; trigger-owned keys
 * stripped) plus the trigger's own `outlet` and, while re-using a handle, `restores`.
 */
export function pauseMeta(
  outlet: string,
  restores: number,
  extra?: Record<string, unknown>,
): NonNullable<WfState['meta']> {
  const meta = { ...callerMeta(extra), outlet }
  return restores > 0 ? { ...meta, restores } : meta
}
