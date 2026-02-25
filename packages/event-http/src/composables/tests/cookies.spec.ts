import { beforeEach, describe, expect, it } from 'vitest'

import { prepareTestHttpContext } from '../../testing'
import { useCookies } from '../cookies'
import { useResponse } from '../response'

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

describe('event-http/cookies useResponse().setCookie', () => {
  let runInContext: ReturnType<typeof prepareTestHttpContext>

  beforeEach(() => {
    runInContext = prepareTestHttpContext({ url: '' })
  })

  it('must set cookie', () => {
    runInContext(() => {
      const response = useResponse()
      response.setCookie('test', 'value')
      response.setCookie('test2', 'value2', { maxAge: 150, secure: true })
      expect(response.getCookie('test')).toEqual({ value: 'value', attrs: {} })
      expect(response.getCookie('test2')).toEqual({
        value: 'value2',
        attrs: { maxAge: 150, secure: true },
      })
    })
  })

  it('must remove cookie', () => {
    runInContext(() => {
      const response = useResponse()
      response.setCookie('test', 'value')
      response.removeCookie('test')
      expect(response.getCookie('test')).toBeUndefined()
    })
  })

  it('must clear cookies', () => {
    runInContext(() => {
      const response = useResponse()
      response.setCookie('test', 'value')
      response.clearCookies()
      expect(response.getCookie('test')).toBeUndefined()
    })
  })
})
