import { createEventContext, current } from '@wooksjs/event-core'
import type { EventContext, EventContextOptions, EventKindSeeds } from '@wooksjs/event-core'

import { httpKind } from './http-kind'

/** Creates an HTTP event context and runs `fn` inside it. */
export function createHttpContext<R>(
  options: EventContextOptions,
  seeds: EventKindSeeds<typeof httpKind>,
  fn: () => R,
): R {
  return createEventContext(options, httpKind, seeds, fn)
}

/** Returns the current HTTP event context. */
export function useHttpContext(ctx?: EventContext): EventContext {
  return ctx ?? current()
}
