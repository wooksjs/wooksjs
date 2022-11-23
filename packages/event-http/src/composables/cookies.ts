import { useHeaders } from './headers'
import { renderCookie } from '../utils/set-cookie'
import { escapeRegex, safeDecodeURIComponent } from '../utils/helpers'
import { attachHook } from '@wooksjs/context-core'
import { useHttpContext } from '../event-http'
import { TCookieAttributes, TSetCookieData } from '../types'

export function useCookies() {
    const { store } = useHttpContext()
    const { cookie } = useHeaders()
    const { init } = store('cookies')
    
    const getCookie = (name: string) => init(name, () => {
        if (cookie) {
            const result = new RegExp(`(?:^|; )${escapeRegex(name)}=(.*?)(?:;?$|; )`, 'i').exec(cookie)
            return result && result[1] ? safeDecodeURIComponent(result[1]) : null
        } else {
            return null
        }    
    })

    return {
        rawCookies: cookie,
        getCookie,
    }
}

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
        return cookiesStore.entries().filter(a => !!a[1]).map(([key, value]) => renderCookie(key, value as TSetCookieData))
    }

    return {
        setCookie,
        getCookie: cookiesStore.get,
        removeCookie: cookiesStore.del,
        clearCookies: cookiesStore.clear,
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
