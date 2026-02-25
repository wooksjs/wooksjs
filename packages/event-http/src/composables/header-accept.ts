import { cachedBy, defineWook } from '@wooksjs/event-core'
import type { EventContext } from '@wooksjs/event-core'

import { httpKind } from '../http-kind'

/** Short names for common Accept MIME types. */
export type KnownAcceptType = 'json' | 'html' | 'xml' | 'text'

const ACCEPT_TYPE_MAP: Record<string, string> = {
  json: 'application/json',
  html: 'text/html',
  xml: 'application/xml',
  text: 'text/plain',
}

const acceptsMime = cachedBy((type: string, ctx: EventContext) => {
  const accept = ctx.get(httpKind.keys.req).headers.accept
  const mime = ACCEPT_TYPE_MAP[type] || type
  return !!(accept && (accept === '*/*' || accept.includes(mime)))
})

/** Provides helpers to check the request's Accept header for supported MIME types. */
export const useAccept = defineWook((ctx: EventContext) => {
  const accept = ctx.get(httpKind.keys.req).headers.accept
  return {
    accept,
    accepts: (type: KnownAcceptType | (string & {})) => acceptsMime(type, ctx),
  }
})
