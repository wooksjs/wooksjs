import { createEventContext, current } from '@wooksjs/event-core'
import type { EventContext, EventContextOptions } from '@wooksjs/event-core'

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
  const ctxOptions = parentCtx ? { ...options, parent: parentCtx } : options
  return <R>(fn: () => R): R =>
    createEventContext(ctxOptions, wfKind, wfSeeds(data), () => {
      current().set(resumeKey, false)
      return fn()
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
  const ctxOptions = parentCtx ? { ...options, parent: parentCtx } : options
  return <R>(fn: () => R): R =>
    createEventContext(ctxOptions, wfKind, wfSeeds(data), () => {
      current().set(resumeKey, true)
      return fn()
    })
}
