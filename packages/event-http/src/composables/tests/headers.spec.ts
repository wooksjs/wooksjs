import { beforeEach, describe, expect, it } from 'vitest'

import { prepareTestHttpContext } from '../../testing'
import { useAccept } from '../header-accept'
import { useAuthorization } from '../header-authorization'
import { useHeaders } from '../headers'
import { useResponse } from '../response'

describe('event-http/headers useHeaders', () => {
  const acceptValue = 'application/json; text/html'
  const authValue1 = 'Bearer ABCDEFG'
  const authValue2 = 'Basic bG9naW46cGFzc3dvcmQ='
  it('must return req.headers', () => {
    prepareTestHttpContext({
      url: '',
      headers: { accept: acceptValue },
    })(() => {
      const headers = useHeaders()
      expect(headers).toEqual({ accept: acceptValue })
    })
  })

  it('must parse "accept" header with short names', () => {
    prepareTestHttpContext({
      url: '',
      headers: { accept: acceptValue },
    })(() => {
      const { accept, has } = useAccept()
      expect(accept).toEqual(acceptValue)
      expect(has('json')).toEqual(true)
      expect(has('xml')).toEqual(false)
      expect(has('text')).toEqual(false)
      expect(has('html')).toEqual(true)
    })
  })

  it('must parse "accept" header with full MIME types', () => {
    prepareTestHttpContext({
      url: '',
      headers: { accept: acceptValue },
    })(() => {
      const { has } = useAccept()
      expect(has('application/json')).toEqual(true)
      expect(has('text/plain')).toEqual(false)
      expect(has('text/html')).toEqual(true)
    })
  })

  it('must parse "auth" header with bearer', () => {
    prepareTestHttpContext({
      url: '',
      headers: { accept: acceptValue, authorization: authValue1 },
    })(() => {
      const { authorization, type, credentials, is, basicCredentials } =
        useAuthorization()
      expect(authorization).toEqual(authValue1)
      expect(type()).toEqual('Bearer')
      expect(credentials()).toEqual('ABCDEFG')
      expect(is('basic')).toEqual(false)
      expect(is('bearer')).toEqual(true)
      expect(basicCredentials()).toBeNull()
    })
  })

  it('must parse "auth" header with basic auth', () => {
    prepareTestHttpContext({
      url: '',
      headers: { accept: acceptValue, authorization: authValue2 },
    })(() => {
      const { authorization, type, credentials, is, basicCredentials } =
        useAuthorization()

      expect(authorization).toEqual(authValue2)
      expect(type()).toEqual('Basic')
      expect(credentials()).toEqual('bG9naW46cGFzc3dvcmQ=')
      expect(is('basic')).toEqual(true)
      expect(is('bearer')).toEqual(false)
      expect(basicCredentials()).toEqual({
        username: 'login',
        password: 'password',
      })
    })
  })
})

describe('event-http/headers useResponse().setHeader', () => {
  let runInContext: ReturnType<typeof prepareTestHttpContext>

  beforeEach(() => {
    runInContext = prepareTestHttpContext({
      url: '',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
    })
  })

  it('must setContentType', () => {
    runInContext(() => {
      const response = useResponse()
      response.setContentType('text/plain')
      expect(response.headers()).toEqual({ 'content-type': 'text/plain' })
    })
  })
  it('must set random header', () => {
    runInContext(() => {
      const response = useResponse()
      response.setHeader('my-header', '1234')
      expect(response.headers()).toHaveProperty('my-header')
      expect(response.getHeader('my-header')).toEqual('1234')
    })
  })
})
