import { IncomingMessage, ServerResponse } from 'http'

import { useHttpContext } from '../../event-http'
import { prepareTestHttpContext } from '../../testing'

describe('http-context', () => {
  const runInContext = prepareTestHttpContext({
    url: '',
    cachedContext: {
      rawBody: 'some data',
    },
  })

  it('must set current http context and read it when useHttpContext', () => {
    runInContext(() => {
      const ctx = useHttpContext().getCtx().event
      expect(ctx.req).toBeInstanceOf(IncomingMessage)
      expect(ctx.res).toBeInstanceOf(ServerResponse)
    })
  })

  it('must useHttpContext', () => {
    runInContext(() => {
      const request = useHttpContext().store('request').value
      expect(request).toEqual({ rawBody: 'some data' })
    })
  })

  it('must clear ctx cache', () => {
    runInContext(() => {
      const reqStore = useHttpContext().store('request')
      reqStore.clear()
      expect(reqStore.value).toEqual({})
    })
  })

  // it('must clear http context and throw error when useCurrentWooksContext', () => {
  //   useHttpContext().clearCtx()
  //   expect(() => useHttpContext()).toThrowError()
  // })
})
