import { EventContext, current, run } from '@wooksjs/event-core'
import { describe, expect, it } from 'vitest'

import { prepareTestHttpContext } from '../../testing'
import { seedRawBody, useRequest } from '../request'

describe('seedRawBody', () => {
  it("a child's rawBody() resolves the seeded bytes, not the parent's — even after the parent read its own", async () => {
    await prepareTestHttpContext({ url: '/p', method: 'POST', rawBody: 'parent' })(async () => {
      const parent = current()
      expect((await useRequest().rawBody()).toString()).toBe('parent')

      const child = new EventContext({ logger: parent.logger, parent })
      seedRawBody(child, Buffer.from('child'))
      await run(child, async () => {
        expect((await useRequest().rawBody()).toString()).toBe('child')
        expect(useRequest().url).toBe('/p')
      })
      expect((await useRequest().rawBody()).toString()).toBe('parent')
    })
  })

  it('accepts a string', async () => {
    await prepareTestHttpContext({ url: '/', method: 'POST' })(async () => {
      seedRawBody(current(), 'abc')
      expect((await useRequest().rawBody()).toString()).toBe('abc')
    })
  })
})
