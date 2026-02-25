import { EventContext, run } from '@wooksjs/event-core'
import type { EventContextOptions } from '@wooksjs/event-core'

import type { TWFEventInput } from './types'
import { resumeKey, wfKind } from './wf-kind'

const wfSeeds = (data: TWFEventInput) => ({
  schemaId: data.schemaId,
  stepId: data.stepId,
  inputContext: data.inputContext,
  indexes: data.indexes,
  input: data.input,
})

/**
 * Creates a new event context for a fresh workflow execution.
 * When `parentCtx` is provided, the workflow creates a child context
 * linked to the parent, so step handlers can transparently access
 * composables from the parent scope (e.g. HTTP) via the parent chain.
 */
export function createWfContext(
  data: TWFEventInput,
  options: EventContextOptions,
  parentCtx?: EventContext,
) {
  const ctx = new EventContext(parentCtx ? { ...options, parent: parentCtx } : options)
  return <R>(fn: () => R): R =>
    run(ctx, () => {
      ctx.set(resumeKey, false)
      return ctx.seed(wfKind, wfSeeds(data), fn)
    })
}

/**
 * Creates an event context for resuming a paused workflow.
 * When `parentCtx` is provided, the workflow creates a child context
 * linked to the parent.
 */
export function resumeWfContext(
  data: TWFEventInput,
  options: EventContextOptions,
  parentCtx?: EventContext,
) {
  const ctx = new EventContext(parentCtx ? { ...options, parent: parentCtx } : options)
  return <R>(fn: () => R): R =>
    run(ctx, () => {
      ctx.set(resumeKey, true)
      return ctx.seed(wfKind, wfSeeds(data), fn)
    })
}
