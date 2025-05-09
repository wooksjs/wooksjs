import { useRouteParams } from '@wooksjs/event-core'
import { IncomingMessage, ServerResponse } from 'http'
import { beforeEach, describe, expect, it } from 'vitest'

import { prepareTestHttpContext } from '../../testing'
import { useRequest } from '../request'
import { useResponse } from '../response'

describe('compasble/req-res', () => {
  const url = 'test.com/path?a[]=1&a[]=2&b=3&c=4&encoded=%7e%20%25'
  const params = {
    a: 'a1',
    b: 'b2',
    c: ['1', '2', '3'],
  }
  const headers = {
    'dummy': 'test',
    'x-forwarded-for': '127.0.0.1, 192.168.0.251',
  }
  const method = 'PUT'

  let runInContext: ReturnType<typeof prepareTestHttpContext>

  beforeEach(() => {
    runInContext = prepareTestHttpContext({ url, params, headers, method })
  })

  it('must return request', () => {
    runInContext(() => {
      const { rawRequest, headers, method, getIp, getIpList, reqId } = useRequest()
      expect(rawRequest).toBeInstanceOf(IncomingMessage)
      expect(headers).toEqual({
        'dummy': 'test',
        'x-forwarded-for': '127.0.0.1, 192.168.0.251',
      })
      expect(method).toBe(method)
      // eslint-disable-next-line no-useless-escape
      expect(reqId()).toMatch(/^[\-0-9a-f]{36}$/u)
      expect(getIp({ trustProxy: true })).toBe('127.0.0.1')
      expect(getIp()).toBe('')
      expect(getIpList()).toEqual({
        remoteIp: '',
        forwarded: ['127.0.0.1', '192.168.0.251'],
      })
    })
  })

  it('must return response', () => {
    runInContext(() => {
      const { rawResponse } = useResponse()
      expect(rawResponse()).toBeInstanceOf(ServerResponse)
    })
  })

  it('must return route-params', () => {
    runInContext(() => {
      const { params, get } = useRouteParams()
      expect(params).toBe(params)
      expect(get('a')).toEqual('a1')
    })
  })
})
