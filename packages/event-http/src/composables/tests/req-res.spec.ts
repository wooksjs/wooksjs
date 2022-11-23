import { useRequest, useRouteParams } from '../request'
import { setTestHttpContext } from '../../testing'
import { IncomingMessage, ServerResponse } from 'http'
import { useResponse } from '../response'

describe('compasble/req-res', () => {
    const url='test.com/path?a[]=1&a[]=2&b=3&c=4&encoded=%7e%20%25'
    const params = {
        a: 'a1',
        b: 'b2',
        c: ['1', '2', '3'],
    }
    const headers = { dummy: 'test', 'x-forwarded-for': '127.0.0.1, 192.168.0.251' }
    const method = 'PUT'

    beforeEach(() => {
        setTestHttpContext({ url, params, headers, method })
    })

    it('must return request', () => {
        const { rawRequest, headers, method, getIp, getIpList, reqId } = useRequest()
        expect(rawRequest).toBeInstanceOf(IncomingMessage)
        expect(headers).toEqual({ dummy: 'test', 'x-forwarded-for': '127.0.0.1, 192.168.0.251' })
        expect(method).toBe(method)
        expect(reqId()).toMatch(/^[a-f0-9\-]{36}$/)
        expect(getIp({ trustProxy: true })).toBe('127.0.0.1')
        expect(getIp()).toBe('')
        expect(getIpList()).toEqual({
            remoteIp: '',
            forwarded: ['127.0.0.1', '192.168.0.251'],
        })
    })

    it('must return response', () => {
        const { rawResponse } = useResponse()
        expect(rawResponse()).toBeInstanceOf(ServerResponse)
    })

    it('must return route-params', () => {
        const { routeParams, getRouteParam } = useRouteParams()
        expect(routeParams).toBe(params)
        expect(getRouteParam('a')).toEqual('a1')
    })
})
