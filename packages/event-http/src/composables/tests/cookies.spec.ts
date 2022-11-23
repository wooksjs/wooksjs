import { useCookies, useSetCookies } from '../cookies'
import { setTestHttpContext } from '../../testing'

describe('event-http/cookies useCookies', () => {
    const cookie = 'cookie-key=cookie-value; newCookie=123456'

    beforeEach(() => {
        setTestHttpContext({ url: '', headers: { cookie } })
    })

    it('must parse cookies', () => {
        const { getCookie } = useCookies()
        expect(getCookie('cookie-key')).toEqual('cookie-value')
        expect(getCookie('newCookie')).toEqual('123456')
    })
    it('must return raw cookies', () => {
        const { rawCookies } = useCookies()
        expect(rawCookies).toEqual(cookie)
    })
})

describe('event-http/cookies useSetCookies', () => {
    beforeEach(() => {
        setTestHttpContext({ url: '' })
    })

    it('must set cookie', () => {
        const { setCookie, cookies } = useSetCookies()
        setCookie('test', 'value')
        setCookie('test2', 'value2', {maxAge: 150, secure: true})
        expect(cookies()[0]).toEqual('test=value')
        expect(cookies()[1]).toEqual('test2=value2; Max-Age=0.15; Secure')
    })

    it('must remove cookie', () => {
        const { setCookie, removeCookie, cookies } = useSetCookies()
        setCookie('test', 'value')
        removeCookie('test')
        expect(cookies()).toEqual([])
    })

    it('must clear cookies', () => {
        const { setCookie, clearCookies, cookies } = useSetCookies()
        setCookie('test', 'value')
        clearCookies()
        expect(cookies()).toEqual([])
    })
})
