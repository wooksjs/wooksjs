import { defineEventKind, key, slot } from '@wooksjs/event-core'

export const wfKind = defineEventKind('WF', {
  schemaId: slot<string>(),
  stepId: slot<string | null>(),
  inputContext: slot<unknown>(),
  indexes: slot<number[] | undefined>(),
  input: slot<unknown | undefined>(),
})

export const resumeKey = key<boolean>('wf.resume')

/**
 * Route params of the flow route a run was started with (e.g. `{ id: '42' }`
 * for flow `user/:id` started as `user/42`). Persisted in the paused state
 * (`state.flowParams`) and restored on resume.
 */
export const flowParamsKey = key<TWfFlowParams>('wf.flowParams')

/** Route params of a flow, as stored in a paused state (`state.flowParams`). */
export type TWfFlowParams = Record<string, string | string[]>
