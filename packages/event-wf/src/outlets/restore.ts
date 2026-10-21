import type { WfState, WfStateStrategy } from '@prostojs/wf/outlets'
import { useLogger } from '@wooksjs/event-core'

import type { WfOutletTriggerConfig } from './types'
import { warnOnce } from './warn-once'

/*
 * restoreOnError — see `WfOutletTriggerConfig.restoreOnError`.
 *
 * A strategy that implements BOTH `consumeEntry()` and `persistEntry()`
 * reports each entry's absolute expiry (a timestamp, `0` = never expires,
 * `undefined` = unknown — legacy entries, stores with their own TTLs) and
 * honours it on write. Resume then consumes through `consumeEntry()`, and a
 * restore re-persists the pre-step state with that exact expiry
 * (`persistEntry(state, { expiresAt })`), so it can never extend a token; it
 * stops after `maxRestores` (counted in `state.meta.restores`). Any other
 * strategy, or an unknown expiry, is never restored.
 */

const DEFAULT_MAX_RESTORES = 3

/** A consumed state plus its expiry, as restoreOnError needs it. */
export interface ConsumedEntry {
  state: WfState | null
  /** absolute expiry (ms); `0` = never expires; `undefined` = unknown */
  expiresAt?: number
}

type ExpiryTrackingStrategy = WfStateStrategy &
  Required<Pick<WfStateStrategy, 'consumeEntry' | 'persistEntry'>>

/** Whether the strategy can report and honour expiries (restorable). */
function tracksExpiry(strategy: WfStateStrategy): strategy is ExpiryTrackingStrategy {
  return typeof strategy.consumeEntry === 'function' && typeof strategy.persistEntry === 'function'
}

/** Consume a handle, capturing its expiry when the strategy can report and honour it. */
export async function consumeWithExpiry(
  strategy: WfStateStrategy,
  raw: string,
): Promise<ConsumedEntry> {
  if (tracksExpiry(strategy)) {
    const entry = await strategy.consumeEntry(raw)
    return { state: entry?.state ?? null, expiresAt: entry?.expiresAt }
  }
  return { state: await strategy.consume(raw) }
}

/** How many times the handle behind this state was already restored. */
export function restoreCount(state: WfState): number {
  const n = state.meta?.restores
  return typeof n === 'number' ? n : 0
}

/** Deep copy of a consumed state (it is serialisable — strategies persist it). */
export function snapshotState(state: WfState): WfState | undefined {
  try {
    return structuredClone(state)
  } catch (error) {
    warnOnce(
      'restore:snapshot',
      `restoreOnError: the workflow state could not be copied, so it will not be restored on error (${(error as Error).message})`,
    )
    return undefined
  }
}

/**
 * Put the pre-step state back under the consumed handle so the same token
 * can be retried — unless the predicate declines the error, the handle hit
 * `maxRestores`, the expiry is unknown or has passed, or the strategy never
 * invalidated the handle (e.g. EncapsulatedStateStrategy). Never extends the
 * lifetime; never masks the step's error (failures are logged).
 */
export async function restoreConsumedState(
  config: WfOutletTriggerConfig,
  strategy: WfStateStrategy,
  raw: string,
  snapshot: WfState,
  consumed: ConsumedEntry,
  error: unknown,
) {
  try {
    const when = config.restoreOnError
    if (typeof when === 'function' && !when(error)) {
      return
    }
    const restores = restoreCount(snapshot)
    if (restores >= (config.maxRestores ?? DEFAULT_MAX_RESTORES)) {
      return
    }
    const { expiresAt } = consumed
    if (
      !tracksExpiry(strategy) ||
      typeof expiresAt !== 'number' ||
      !Number.isFinite(expiresAt) ||
      expiresAt < 0
    ) {
      warnOnce(
        'restore:expiry-unknown',
        'restoreOnError: the state expiry is unknown (the strategy lacks consumeEntry()/persistEntry(), or its store does not report expiresAt) — not restored, so its lifetime cannot be extended.',
      )
      return
    }
    if (expiresAt !== 0 && expiresAt <= Date.now()) {
      return
    }
    if (await strategy.retrieve(raw)) {
      return
    }
    await strategy.persistEntry(
      { ...snapshot, meta: { ...snapshot.meta, restores: restores + 1 } },
      { expiresAt },
      { handle: raw },
    )
  } catch (restoreError) {
    useLogger('wf-outlet').error(
      `restoreOnError: failed to restore the workflow state after a resume error (${(restoreError as Error).message})`,
    )
  }
}
