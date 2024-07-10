import { prepareTestHttpContext } from '../../testing'
import { useAccept } from '../header-accept'
import { useAuthorization } from '../header-authorization'
import { useHeaders, useSetHeaders } from '../headers'

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

  it('must parse "accept" header', () => {
    prepareTestHttpContext({
      url: '',
      headers: { accept: acceptValue },
    })(() => {
      const { accept, accepts, acceptsJson, acceptsXml, acceptsText, acceptsHtml } = useAccept()
      expect(accept).toEqual(acceptValue)
      expect(accepts('application/json')).toEqual(true)
      expect(accepts('text/plain')).toEqual(false)
      expect(accepts('text/html')).toEqual(true)
      expect(acceptsJson()).toEqual(true)
      expect(acceptsXml()).toEqual(false)
      expect(acceptsText()).toEqual(false)
      expect(acceptsHtml()).toEqual(true)
    })
  })

  it('must parse "auth" header with bearer', () => {
    prepareTestHttpContext({
      url: '',
      headers: { accept: acceptValue, authorization: authValue1 },
    })(() => {
      const { authorization, authType, authRawCredentials, isBasic, isBearer, basicCredentials } =
        useAuthorization()
      expect(authorization).toEqual(authValue1)
      expect(authType()).toEqual('Bearer')
      expect(authRawCredentials()).toEqual('ABCDEFG')
      expect(isBasic()).toEqual(false)
      expect(isBearer()).toEqual(true)
      expect(basicCredentials()).toBeNull()
    })
  })

  it('must parse "auth" header with basic auth', () => {
    prepareTestHttpContext({
      url: '',
      headers: { accept: acceptValue, authorization: authValue2 },
    })(() => {
      const { authorization, authType, authRawCredentials, isBasic, isBearer, basicCredentials } =
        useAuthorization()

      expect(authorization).toEqual(authValue2)
      expect(authType()).toEqual('Basic')
      expect(authRawCredentials()).toEqual('bG9naW46cGFzc3dvcmQ=')
      expect(isBasic()).toEqual(true)
      expect(isBearer()).toEqual(false)
      expect(basicCredentials()).toEqual({
        username: 'login',
        password: 'password',
      })
    })
  })
})

describe('event-http/headers useSetHeaders', () => {
  let runInContext: ReturnType<typeof prepareTestHttpContext>

  beforeEach(() => {
    runInContext = prepareTestHttpContext({
      url: '',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
      },
    })
  })

  it('must setContentType', () => {
    runInContext(() => {
      const { setContentType, headers } = useSetHeaders()
      setContentType('text/plain')
      expect(headers()).toEqual({ 'content-type': 'text/plain' })
    })
  })
  it('must set random header', () => {
    runInContext(() => {
      const { setHeader, headers, getHeader } = useSetHeaders()
      setHeader('my-header', '1234')
      expect(headers()).toHaveProperty('my-header')
      expect(getHeader('my-header')).toEqual('1234')
    })
  })
})
