import { innerCacheSymbols, useWooksCtx } from '../../core'
import { setTestWooksContext } from '../../testing'
import { IncomingMessage, ServerResponse } from 'http'
import { useCacheStore } from '../../cache'

describe('composables/core', () => {
    setTestWooksContext({
        url: '',
        cachedContext: {
            rawBody: 'some data',
        },
    })

    it('must set current http context and read it when useCurrentWooksContext', () => {
        const ctx = useWooksCtx().getCtx()
        expect(ctx.req).toBeInstanceOf(IncomingMessage)
        expect(ctx.res).toBeInstanceOf(ServerResponse)
    })

    it('must useCtxCache', () => {
        const { getAll } = useCacheStore(innerCacheSymbols.request)
        expect(getAll()).toEqual({ rawBody: 'some data' })
    })

    it('must clear ctx cache', () => {
        const { clear, getAll } = useCacheStore(innerCacheSymbols.request)
        clear()
        expect(getAll()).toEqual({})
    })

    it('must clear http context and throw error when useCurrentWooksContext', () => {
        useWooksCtx().clearCtx()
        expect(() => useWooksCtx()).toThrowError()
    })
})
