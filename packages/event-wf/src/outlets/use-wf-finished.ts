import type { EventContext } from '@wooksjs/event-core'

import { defineWfWook } from '../run-context'

import type { WfFinishedResponse } from './outlet-context'
import { wfFinishedKey } from './outlet-context'

/**
 * Composable to set the completion response for a finished workflow.
 *
 * @example
 * ```ts
 * // Redirect after login
 * useWfFinished().set({ type: 'redirect', value: '/dashboard' })
 *
 * // Return data
 * useWfFinished().set({ type: 'data', value: { success: true } })
 * ```
 */
export const useWfFinished = defineWfWook((ctx: EventContext) => ({
  set: (response: WfFinishedResponse) => ctx.set(wfFinishedKey, response),
  get: () => (ctx.has(wfFinishedKey) ? ctx.get(wfFinishedKey) : undefined),
}))
