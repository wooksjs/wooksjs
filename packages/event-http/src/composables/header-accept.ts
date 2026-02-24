import { cachedBy, defineWook } from '@wooksjs/event-core'
import type { EventContext } from '@wooksjs/event-core'

import { httpKind } from '../http-kind'

const acceptsMime = cachedBy((mime: string, ctx: EventContext) => {
  const accept = ctx.get(httpKind.keys.req).headers.accept
  return !!(accept && (accept === '*/*' || accept.includes(mime)))
})

/** Provides helpers to check the request's Accept header for supported MIME types. */
export const useAccept = defineWook((ctx: EventContext) => {
  const accept = ctx.get(httpKind.keys.req).headers.accept
  return {
    accept,
    accepts: (mime: string) => acceptsMime(mime, ctx),
    acceptsJson: () => acceptsMime('application/json', ctx),
    acceptsXml: () => acceptsMime('application/xml', ctx),
    acceptsText: () => acceptsMime('text/plain', ctx),
    acceptsHtml: () => acceptsMime('text/html', ctx),
  }
})
