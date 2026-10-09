import { cachedBy, defineWook } from '@wooksjs/event-core'
import type { EventContext } from '@wooksjs/event-core'

import { httpKind } from '../http-kind'
import { acceptHeaderHas } from '../utils/accept'

/** Short names for common Accept MIME types. */
export type KnownAcceptType = 'json' | 'html' | 'xml' | 'text'

const acceptsMime = cachedBy((type: string, ctx: EventContext) =>
  acceptHeaderHas(ctx.get(httpKind.keys.req).headers.accept, type),
)

/** Provides helpers to check the request's Accept header for supported MIME types. */
export const useAccept = defineWook((ctx: EventContext) => {
  const accept = ctx.get(httpKind.keys.req).headers.accept
  return {
    accept,
    has: (type: KnownAcceptType | (string & {})) => acceptsMime(type, ctx),
  }
})
