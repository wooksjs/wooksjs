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
      const { accept, accepts } = useAccept()
      expect(accept).toEqual(acceptValue)
      expect(accepts('json')).toEqual(true)
      expect(accepts('xml')).toEqual(false)
      expect(accepts('text')).toEqual(false)
      expect(accepts('html')).toEqual(true)
    })
  })

  it('must parse "accept" header with full MIME types', () => {
    prepareTestHttpContext({
      url: '',
      headers: { accept: acceptValue },
    })(() => {
      const { accepts } = useAccept()
      expect(accepts('application/json')).toEqual(true)
      expect(accepts('text/plain')).toEqual(false)
      expect(accepts('text/html')).toEqual(true)
    })
  })

  it('must parse "auth" header with bearer', () => {
    prepareTestHttpContext({
      url: '',
      headers: { accept: acceptValue, authorization: authValue1 },
    })(() => {
      const { authorization, authType, authRawCredentials, authIs, basicCredentials } =
        useAuthorization()
      expect(authorization).toEqual(authValue1)
      expect(authType()).toEqual('Bearer')
      expect(authRawCredentials()).toEqual('ABCDEFG')
      expect(authIs('basic')).toEqual(false)
      expect(authIs('bearer')).toEqual(true)
      expect(basicCredentials()).toBeNull()
    })
  })

  it('must parse "auth" header with basic auth', () => {
    prepareTestHttpContext({
      url: '',
      headers: { accept: acceptValue, authorization: authValue2 },
    })(() => {
      const { authorization, authType, authRawCredentials, authIs, basicCredentials } =
        useAuthorization()

      expect(authorization).toEqual(authValue2)
      expect(authType()).toEqual('Basic')
      expect(authRawCredentials()).toEqual('bG9naW46cGFzc3dvcmQ=')
      expect(authIs('basic')).toEqual(true)
      expect(authIs('bearer')).toEqual(false)
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
