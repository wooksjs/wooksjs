import { defineWook } from '@wooksjs/event-core'
import type { EventContext } from '@wooksjs/event-core'

import { resumeKey, wfKind } from '../wf-kind'

/**
 * Composable that provides access to the current workflow execution state.
 * @example
 * ```ts
 * const { ctx, input, schemaId, stepId } = useWfState()
 * const context = ctx<MyContext>()
 * const stepInput = input<MyInput>()
 * ```
 */
export const useWfState = defineWook((c: EventContext) => ({
  ctx: <T>() => c.get(wfKind.keys.inputContext) as T,
  input: <I>() => c.get(wfKind.keys.input) as I | undefined,
  schemaId: c.get(wfKind.keys.schemaId),
  stepId: () => c.get(wfKind.keys.stepId),
  indexes: () => c.get(wfKind.keys.indexes),
  resume: c.get(resumeKey),
}))
