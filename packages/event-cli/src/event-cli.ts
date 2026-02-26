import { createEventContext } from '@wooksjs/event-core'
import type { EventContextOptions, EventKindSeeds } from '@wooksjs/event-core'

import { cliKind } from './cli-kind'

/** Creates a CLI event context and runs `fn` inside it. */
export function createCliContext<R>(
  options: EventContextOptions,
  seeds: EventKindSeeds<typeof cliKind>,
  fn: () => R,
): R {
  return createEventContext(options, cliKind, seeds, fn)
}
