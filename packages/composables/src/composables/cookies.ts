import { useHeaders } from './headers'
import { innerCacheSymbols } from '../core'
import { renderCookie, TCookieAttributes, TSetCookieData } from '../utils/set-cookie'
import { escapeRegex, safeDecodeURIComponent } from '../utils/helpers'
import { useCacheStore } from '../cache'
import { attachHook } from '../hooks'

export type TCookiesCache = Record<string, string | null>
type TSetCookieCache = Record<string, TSetCookieData>

export function useCookies() {
    const { get, set, has } = useCacheStore<TCookiesCache>(innerCacheSymbols.cookies)
    const { cookie } = useHeaders()
    
    function getCookie(name: string) {
        if (!has(name)) {
            if (cookie) {
                const result = new RegExp(`(?:^|; )${escapeRegex(name)}=(.*?)(?:;?$|; )`, 'i').exec(cookie)
                return set(name, result && result[1] ? safeDecodeURIComponent(result[1]) : null)
            } else {
                return set(name, null)
            }
        }
        return get(name)
    }

    return {
        rawCookies: cookie,
        getCookie,
    }
}

export function useSetCookies() {
    const { clear, get, set, entries, del } = useCacheStore<TSetCookieCache>(innerCacheSymbols.setCookies)

    function setCookie(name: string, value: string, attrs?: Partial<TCookieAttributes>) {
        set(name, {
            value,
            attrs: attrs || {},
        })
    }

    function cookies(): string[] {
        return entries().filter(a => !!a[1]).map(([key, value]) => renderCookie(key, value as TSetCookieData))
    }

    return {
        setCookie,
        getCookie: get,
        removeCookie: del,
        clearCookies: clear,
        cookies,
    }
}

export function useSetCookie(name: string) {
    const { setCookie, getCookie } = useSetCookies()

    const valueHook = attachHook({
        name,
        type: 'cookie',
    }, {
        get: () => getCookie(name)?.value,
        set: (value: string) => setCookie(name, value, getCookie(name)?.attrs),
    })

    return attachHook(valueHook, {
        get: () => getCookie(name)?.attrs as TCookieAttributes,
        set: (attrs: TCookieAttributes) => setCookie(name, getCookie(name)?.value || '', attrs),
    }, 'attrs')
}

export type TCookieHook = ReturnType<typeof useSetCookie>
