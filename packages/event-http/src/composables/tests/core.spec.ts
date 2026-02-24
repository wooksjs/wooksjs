import { current } from '@wooksjs/event-core'
import { IncomingMessage } from 'http'
import { describe, expect, it } from 'vitest'

import { httpKind } from '../../http-kind'
import { HttpResponse } from '../../response/http-response'
import { prepareTestHttpContext } from '../../testing'

describe('http-context', () => {
  const runInContext = prepareTestHttpContext({ url: '/test' })

  it('must provide access to req and response via httpKind', () => {
    runInContext(() => {
      const ctx = current()
      expect(ctx.get(httpKind.keys.req)).toBeInstanceOf(IncomingMessage)
      expect(ctx.get(httpKind.keys.response)).toBeInstanceOf(HttpResponse)
    })
  })

  it('must provide access to the current EventContext', () => {
    runInContext(() => {
      const ctx = current()
      expect(ctx).toBeDefined()
      expect(ctx.get(httpKind.keys.req).url).toBe('/test')
    })
  })
})
