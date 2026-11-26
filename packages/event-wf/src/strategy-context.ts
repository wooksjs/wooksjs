import { key } from '@wooksjs/event-core'

/**
 * Name of the strategy currently active for the running workflow. Per run: written with
 * `setOwn` on the run's own context (see `runContext()`).
 */
export const stateStrategyNameKey = key<string>('wf.strategyName')

/**
 * Set (`true`) by `renewStateToken()` on the run's own context: the pause that ends the run is
 * persisted under a fresh handle.
 */
export const renewStateTokenKey = key<boolean>('wf.renewStateToken')

/** Strategy names must match this regex (validated at swap call + config). */
export const STRATEGY_NAME_RE = /^[A-Za-z0-9_-]+$/
