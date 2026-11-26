import { createEventContext, current, routeParamsKey } from '@wooksjs/event-core'
import type { EventContextOptions, EventKindSeeds } from '@wooksjs/event-core'

import { wfFinishedKey } from './outlets/outlet-context'
import { runContext } from './run-context'
import { flowParamsKey, resumeKey, wfKind } from './wf-kind'

/** Creates a WF event context for a fresh workflow execution and runs `fn` inside it. */
export function createWfContext<R>(
  options: EventContextOptions,
  seeds: EventKindSeeds<typeof wfKind>,
  fn: () => R,
): R {
  return createEventContext(options, wfKind, seeds, () => {
    seedRun(false)
    return fn()
  })
}

/** Creates a WF event context for resuming a paused workflow and runs `fn` inside it. */
export function resumeWfContext<R>(
  options: EventContextOptions,
  seeds: EventKindSeeds<typeof wfKind>,
  fn: () => R,
): R {
  return createEventContext(options, wfKind, seeds, () => {
    seedRun(true)
    return fn()
  })
}

/**
 * Per-run slots on the run's OWN context, so writes in the run (route params of its flow and
 * steps, …) never reach the parent — the HTTP request it runs in, or the run whose step started
 * it — and reads never see the parent's. A run started inside another run also keeps its own
 * finished response: only a top-level run hands it to the trigger of its request.
 */
function seedRun(resume: boolean): void {
  const ctx = current()
  ctx.setOwn(resumeKey, resume)
  ctx.setOwn(routeParamsKey, {})
  ctx.setOwn(flowParamsKey, {})
  if (ctx.parent && runContext(ctx.parent)) {
    ctx.setOwn(wfFinishedKey, undefined)
  }
}
