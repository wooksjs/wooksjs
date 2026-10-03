import { EventContext, current, run } from '@wooksjs/event-core'
import { prepareTestHttpContext, useRequest } from '@wooksjs/event-http'
import { describe, expect, it } from 'vitest'

import { seedBody, useBody } from '../body'

function parentWithBody() {
  return prepareTestHttpContext({
    url: '/parent',
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    rawBody: JSON.stringify({ query: { q: 'status=open' } }),
  })
}

function child(parent: EventContext) {
  return new EventContext({ logger: parent.logger, parent })
}

describe('seedBody', () => {
  it('a child seeded with a value never reads the parent body — even when the parent already parsed it', async () => {
    await parentWithBody()(async () => {
      const parent = current()
      // the parent built (and cached) its body composables first
      expect(await useBody().parseBody()).toEqual({ query: { q: 'status=open' } })
      expect((await useRequest().rawBody()).toString()).toContain('status=open')

      const c = child(parent)
      seedBody(c, { ids: [1, 2] })
      await run(c, async () => {
        expect(await useBody().parseBody()).toEqual({ ids: [1, 2] })
        expect((await useBody().rawBody()).toString()).toBe('{"ids":[1,2]}')
        expect((await useRequest().rawBody()).toString()).toBe('{"ids":[1,2]}')
        expect(useBody().is('json')).toBe(true)
        // everything else still reads through the parent
        expect(useRequest().url).toBe('/parent')
      })

      // the parent is untouched
      expect(await useBody().parseBody()).toEqual({ query: { q: 'status=open' } })
    })
  })

  it('seeds before the parent ever built its composables', async () => {
    await parentWithBody()(async () => {
      const c = child(current())
      seedBody(c, { a: 1 })
      await run(c, async () => {
        expect(await useBody().parseBody()).toEqual({ a: 1 })
      })
      expect(await useBody().parseBody()).toEqual({ query: { q: 'status=open' } })
    })
  })

  it('defaults raw bytes and content type by value kind; honours explicit options', async () => {
    await parentWithBody()(async () => {
      const parent = current()
      const text = child(parent)
      seedBody(text, 'hello')
      await run(text, async () => {
        expect(useBody().is('text')).toBe(true)
        expect(useBody().is('json')).toBe(false)
        expect((await useBody().rawBody()).toString()).toBe('hello')
      })

      const bin = child(parent)
      seedBody(bin, Buffer.from([1, 2, 3]))
      await run(bin, async () => {
        expect(useBody().is('binary')).toBe(true)
        expect([...(await useBody().rawBody())]).toEqual([1, 2, 3])
      })

      const custom = child(parent)
      seedBody(
        custom,
        { name: 'x' },
        { raw: 'name=x', contentType: 'application/x-www-form-urlencoded' },
      )
      await run(custom, async () => {
        expect(useBody().is('urlencoded')).toBe(true)
        expect(await useBody().parseBody()).toEqual({ name: 'x' })
        expect((await useRequest().rawBody()).toString()).toBe('name=x')
      })
    })
  })

  it('works on a context without a parent', async () => {
    await prepareTestHttpContext({ url: '/', method: 'POST' })(async () => {
      seedBody(current(), [1, 2])
      expect(await useBody().parseBody()).toEqual([1, 2])
      expect(useBody().is('json')).toBe(true)
    })
  })
})

describe('seedBody with raw bytes only', () => {
  it('parses the seeded bytes in the child, never the parent body — even after the parent parsed', async () => {
    await parentWithBody()(async () => {
      const parent = current()
      expect(await useBody().parseBody()).toEqual({ query: { q: 'status=open' } })
      const c = child(parent)
      seedBody(c, undefined, { raw: '{"ids":[3]}' })
      await run(c, async () => {
        expect(useBody().is('json')).toBe(true) // the request's content type
        expect(await useBody().parseBody()).toEqual({ ids: [3] })
      })
      const form = child(parent)
      seedBody(form, undefined, { raw: 'a=1', contentType: 'application/x-www-form-urlencoded' })
      await run(form, async () => {
        expect(await useBody().parseBody()).toEqual({ a: '1' })
      })
    })
  })

  it('an undefined body without raw seeds an empty body', async () => {
    await parentWithBody()(async () => {
      const c = child(current())
      seedBody(c, undefined)
      await run(c, async () => {
        expect(await useBody().parseBody()).toBeUndefined()
        expect((await useRequest().rawBody()).length).toBe(0)
      })
    })
  })
})
