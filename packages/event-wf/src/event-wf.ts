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
 * When `parentCtx` is provided, the workflow attaches its slots to
 * the existing context instead of creating a new one, allowing step
 * handlers to access composables from the parent scope (e.g. HTTP).
 */
export function createWfContext(
  data: TWFEventInput,
  options: EventContextOptions,
  parentCtx?: EventContext,
) {
  const ctx = parentCtx ?? new EventContext(options)
  return <R>(fn: () => R): R =>
    run(ctx, () => {
      ctx.set(resumeKey, false)
      return ctx.attach(wfKind, wfSeeds(data), fn)
    })
}

/**
 * Creates an event context for resuming a paused workflow.
 * When `parentCtx` is provided, the workflow attaches its slots to
 * the existing context instead of creating a new one.
 */
export function resumeWfContext(
  data: TWFEventInput,
  options: EventContextOptions,
  parentCtx?: EventContext,
) {
  const ctx = parentCtx ?? new EventContext(options)
  return <R>(fn: () => R): R =>
    run(ctx, () => {
      ctx.set(resumeKey, true)
      return ctx.attach(wfKind, wfSeeds(data), fn)
    })
}
