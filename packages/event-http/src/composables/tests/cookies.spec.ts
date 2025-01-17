import { beforeEach, describe, expect, it } from 'vitest'

import { prepareTestHttpContext } from '../../testing'
import { useCookies, useSetCookies } from '../cookies'

describe('event-http/cookies useCookies', () => {
  const cookie = 'cookie-key=cookie-value; newCookie=123456'
  let runInContext: ReturnType<typeof prepareTestHttpContext>

  beforeEach(() => {
    runInContext = prepareTestHttpContext({ url: '', headers: { cookie } })
  })

  it('must parse cookies', () => {
    runInContext(() => {
      const { getCookie } = useCookies()
      expect(getCookie('cookie-key')).toEqual('cookie-value')
      expect(getCookie('newCookie')).toEqual('123456')
    })
  })
  it('must return raw cookies', () => {
    runInContext(() => {
      const { rawCookies } = useCookies()
      expect(rawCookies).toEqual(cookie)
    })
  })
})

describe('event-http/cookies useSetCookies', () => {
  let runInContext: ReturnType<typeof prepareTestHttpContext>

  beforeEach(() => {
    runInContext = prepareTestHttpContext({ url: '' })
  })

  it('must set cookie', () => {
    runInContext(() => {
      const { setCookie, cookies } = useSetCookies()
      setCookie('test', 'value')
      setCookie('test2', 'value2', { maxAge: 150, secure: true })
      expect(cookies()[0]).toEqual('test=value')
      expect(cookies()[1]).toEqual('test2=value2; Max-Age=0.15; Secure')
    })
  })

  it('must remove cookie', () => {
    runInContext(() => {
      const { setCookie, removeCookie, cookies } = useSetCookies()
      setCookie('test', 'value')
      removeCookie('test')
      expect(cookies()).toEqual([])
    })
  })

  it('must clear cookies', () => {
    runInContext(() => {
      const { setCookie, clearCookies, cookies } = useSetCookies()
      setCookie('test', 'value')
      clearCookies()
      expect(cookies()).toEqual([])
    })
  })
})
