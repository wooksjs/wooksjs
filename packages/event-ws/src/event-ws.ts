import { createEventContext } from '@wooksjs/event-core'
import type { EventContextOptions, EventKindSeeds } from '@wooksjs/event-core'

import { wsConnectionKind, wsMessageKind } from './ws-kind'

/** Creates a WS connection event context and runs `fn` inside it. */
export function createWsConnectionContext<R>(
  options: EventContextOptions,
  seeds: EventKindSeeds<typeof wsConnectionKind>,
  fn: () => R,
): R {
  return createEventContext(options, wsConnectionKind, seeds, fn)
}

/** Creates a WS message event context and runs `fn` inside it. */
export function createWsMessageContext<R>(
  options: EventContextOptions,
  seeds: EventKindSeeds<typeof wsMessageKind>,
  fn: () => R,
): R {
  return createEventContext(options, wsMessageKind, seeds, fn)
}
