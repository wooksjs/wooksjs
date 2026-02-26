import { createEventContext, current } from '@wooksjs/event-core'
import type { EventContextOptions, EventKindSeeds } from '@wooksjs/event-core'

import { resumeKey, wfKind } from './wf-kind'

/** Creates a WF event context for a fresh workflow execution and runs `fn` inside it. */
export function createWfContext<R>(
  options: EventContextOptions,
  seeds: EventKindSeeds<typeof wfKind>,
  fn: () => R,
): R {
  return createEventContext(options, wfKind, seeds, () => {
    current().set(resumeKey, false)
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
    current().set(resumeKey, true)
    return fn()
  })
}
