import { EventContext, run } from '@wooksjs/event-core'
import type { EventContextOptions } from '@wooksjs/event-core'

import type { TWFEventInput } from './types'
import { resumeKey, wfKind } from './wf-kind'

/** Creates a new event context for a fresh workflow execution. */
export function createWfContext(data: TWFEventInput, options: EventContextOptions) {
  const ctx = new EventContext(options)
  return <R>(fn: () => R): R =>
    run(ctx, () => {
      ctx.set(resumeKey, false)
      return ctx.attach(
        wfKind,
        {
          schemaId: data.schemaId,
          stepId: data.stepId,
          inputContext: data.inputContext,
          indexes: data.indexes,
          input: data.input,
        },
        fn,
      )
    })
}

/** Creates an event context for resuming a paused workflow. */
export function resumeWfContext(data: TWFEventInput, options: EventContextOptions) {
  const ctx = new EventContext(options)
  return <R>(fn: () => R): R =>
    run(ctx, () => {
      ctx.set(resumeKey, true)
      return ctx.attach(
        wfKind,
        {
          schemaId: data.schemaId,
          stepId: data.stepId,
          inputContext: data.inputContext,
          indexes: data.indexes,
          input: data.input,
        },
        fn,
      )
    })
}
