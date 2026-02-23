import { attachHook } from '@wooksjs/event-core'

import { useHttpContext } from '../event-http'
import type { TCookieAttributes, TSetCookieData } from '../types'
import { escapeRegex, safeDecodeURIComponent } from '../utils/helpers'
import { renderCookie } from '../utils/set-cookie'
import { useHeaders } from './headers'

const cookieRegExpCache = new Map<string, RegExp>()
function getCookieRegExp(name: string): RegExp {
  let re = cookieRegExpCache.get(name)
  if (!re) {
    re = new RegExp(`(?:^|; )${escapeRegex(name)}=(.*?)(?:;?$|; )`, 'i')
    cookieRegExpCache.set(name, re)
  }
  return re
}

/**
 * Provides access to parsed request cookies.
 * @example
 * ```ts
 * const { getCookie, rawCookies } = useCookies()
 * const sessionId = getCookie('session_id')
 * ```
 */
export function useCookies() {
  const { store } = useHttpContext()
  const { cookie } = useHeaders()
  const { init } = store('cookies')

  const getCookie = (name: string) =>
    init(name, () => {
      if (cookie) {
        const result = getCookieRegExp(name).exec(cookie)
        return result?.[1] ? safeDecodeURIComponent(result[1]) : null
      } else {
        return null
      }
    })

  return {
    rawCookies: cookie,
    getCookie,
  }
}

/** Provides methods to set, get, remove, and clear outgoing response cookies. */
export function useSetCookies() {
  const { store } = useHttpContext()
  const cookiesStore = store('setCookies')

  function setCookie(name: string, value: string, attrs?: Partial<TCookieAttributes>) {
    cookiesStore.set(name, {
      value,
      attrs: attrs || {},
    })
  }

  function cookies(): string[] {
    const entries = cookiesStore.entries()
    if (entries.length === 0) return entries as unknown as string[]
    return entries
      .filter((a) => !!a[1])
      .map(([key, value]) => renderCookie(key, value as TSetCookieData))
  }

  return {
    setCookie,
    getCookie: cookiesStore.get,
    removeCookie: cookiesStore.del,
    clearCookies: cookiesStore.clear,
    cookies,
  }
}

/** Returns a hookable accessor for a single outgoing cookie by name. */
export function useSetCookie(name: string) {
  const { setCookie, getCookie } = useSetCookies()

  const valueHook = attachHook(
    {
      name,
      type: 'cookie',
    },
    {
      get: () => getCookie(name)?.value,
      set: (value: string) => {
        setCookie(name, value, getCookie(name)?.attrs)
      },
    },
  )

  return attachHook(
    valueHook,
    {
      get: () => getCookie(name)?.attrs as TCookieAttributes,
      set: (attrs: TCookieAttributes) => {
        setCookie(name, getCookie(name)?.value || '', attrs)
      },
    },
    'attrs',
  )
}

/** Hook type returned by {@link useSetCookie}. */
export type TCookieHook = ReturnType<typeof useSetCookie>
