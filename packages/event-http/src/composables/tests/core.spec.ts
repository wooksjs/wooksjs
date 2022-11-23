import { setTestHttpContext } from '../../testing'
import { IncomingMessage, ServerResponse } from 'http'
import { useHttpContext } from '../../event-http'

describe('http-context', () => {
    setTestHttpContext({
        url: '',
        cachedContext: {
            rawBody: 'some data',
        },
    })

    it('must set current http context and read it when useHttpContext', () => {
        const ctx = useHttpContext().getCtx().event
        expect(ctx.req).toBeInstanceOf(IncomingMessage)
        expect(ctx.res).toBeInstanceOf(ServerResponse)
    })

    it('must useHttpContext', () => {
        const request = useHttpContext().store('request').value
        expect(request).toEqual({ rawBody: 'some data' })
    })

    it('must clear ctx cache', () => {
        const reqStore = useHttpContext().store('request')
        reqStore.clear()
        expect(reqStore.value).toEqual({})
    })

    it('must clear http context and throw error when useCurrentWooksContext', () => {
        useHttpContext().clearCtx()
        expect(() => useHttpContext()).toThrowError()
    })
})
