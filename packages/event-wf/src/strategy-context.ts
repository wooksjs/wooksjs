import { key } from '@wooksjs/event-core'

/** Name of the strategy currently active for the running workflow. */
export const stateStrategyNameKey = key<string>('wf.strategyName')

/** Strategy names must match this regex (validated at swap call + config). */
export const STRATEGY_NAME_RE = /^[A-Za-z0-9_-]+$/
