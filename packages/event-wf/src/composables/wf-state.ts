import { defineWook } from '@wooksjs/event-core'
import type { EventContext } from '@wooksjs/event-core'

import { flowParamsKey, resumeKey, wfKind } from '../wf-kind'

/**
 * Composable that provides access to the current workflow execution state.
 * @example
 * ```ts
 * const { ctx, input, schemaId, stepId, flowParams } = useWfState()
 * const context = ctx<MyContext>()
 * const stepInput = input<MyInput>()
 * const { id } = flowParams<{ id: string }>() // flow `user/:id` started as `user/42` → '42'
 * ```
 */
export const useWfState = defineWook((c: EventContext) => ({
  ctx: <T>() => c.get(wfKind.keys.inputContext) as T,
  input: <I>() => c.get(wfKind.keys.input) as I | undefined,
  schemaId: c.get(wfKind.keys.schemaId),
  stepId: () => c.get(wfKind.keys.stepId),
  indexes: () => c.get(wfKind.keys.indexes),
  resume: c.get(resumeKey),
  /**
   * Route params of the flow (`{ id: '42' }` for flow `user/:id` started as
   * `user/42`), restored on resume. Inside a step, `useRouteParams()` returns
   * the step's own route params, not these.
   */
  flowParams: <P extends Record<string, string | string[]> = Record<string, string | string[]>>() =>
    (c.has(flowParamsKey) ? c.get(flowParamsKey) : {}) as P,
}))
