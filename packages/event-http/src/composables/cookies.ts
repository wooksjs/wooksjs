import { cachedBy, defineWook } from '@wooksjs/event-core'
import type { EventContext } from '@wooksjs/event-core'

import { httpKind } from '../http-kind'
import { escapeRegex, safeDecodeURIComponent } from '../utils/helpers'

const cookieRegExpCache = new Map<string, RegExp>()
function getCookieRegExp(name: string): RegExp {
  let re = cookieRegExpCache.get(name)
  if (!re) {
    re = new RegExp(`(?:^|; )${escapeRegex(name)}=(.*?)(?:;?$|; )`, 'i')
    cookieRegExpCache.set(name, re)
  }
  return re
}

const parseCookieValue = cachedBy((name: string, ctx: EventContext) => {
  const cookie = ctx.get(httpKind.keys.req).headers.cookie
  if (cookie) {
    const result = getCookieRegExp(name).exec(cookie)
    return result?.[1] ? safeDecodeURIComponent(result[1]) : null
  }
  return null
})

/**
 * Provides access to parsed request cookies.
 * @example
 * ```ts
 * const { getCookie, raw } = useCookies()
 * const sessionId = getCookie('session_id')
 * ```
 */
export const useCookies = defineWook((ctx: EventContext) => ({
  raw: ctx.get(httpKind.keys.req).headers.cookie,
  getCookie: (name: string) => parseCookieValue(name, ctx),
}))
