import { key } from '@wooksjs/event-core'
import type { WfOutlet, WfStateStrategy } from '@prostojs/wf/outlets'

/** Registered outlet handlers, keyed by name */
export const outletsRegistryKey = key<Map<string, WfOutlet>>('wf.outlets.registry')

/** Active state strategy for current request */
export const stateStrategyKey = key<WfStateStrategy>('wf.outlets.stateStrategy')

/** Finished response set by workflow steps */
export const wfFinishedKey = key<WfFinishedResponse | undefined>('wf.outlets.finished')

export interface WfFinishedResponse {
  type: 'redirect' | 'data'
  /** Redirect URL or response body */
  value: unknown
  /** HTTP status code (default 200 for data, 302 for redirect) */
  status?: number
  /** Cookies to set */
  cookies?: Record<string, { value: string; options?: Record<string, unknown> }>
}
