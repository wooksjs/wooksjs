import { describe, expect, it } from 'vitest'

import { prepareTestHttpContext } from '@wooksjs/event-http'
import { useBody } from '../body'

describe('body', () => {
  it('must detect content-type application/json', () => {
    prepareTestHttpContext({
      url: '',
      headers: { 'content-type': 'application/json' },
    })(() => {
      const { contentIs } = useBody()
      expect(contentIs('json')).toBe(true)
      expect(contentIs('xml')).toBe(false)
      expect(contentIs('html')).toBe(false)
      expect(contentIs('text')).toBe(false)
      expect(contentIs('binary')).toBe(false)
      expect(contentIs('form-data')).toBe(false)
      expect(contentIs('urlencoded')).toBe(false)
    })
  })

  it('must detect content-type text/xml', () => {
    prepareTestHttpContext({
      url: '',
      headers: { 'content-type': 'text/xml' },
    })(() => {
      const { contentIs } = useBody()
      expect(contentIs('json')).toBe(false)
      expect(contentIs('xml')).toBe(true)
      expect(contentIs('html')).toBe(false)
      expect(contentIs('text')).toBe(false)
      expect(contentIs('binary')).toBe(false)
      expect(contentIs('form-data')).toBe(false)
      expect(contentIs('urlencoded')).toBe(false)
    })
  })

  it('must detect content-type text/html', () => {
    prepareTestHttpContext({
      url: '',
      headers: { 'content-type': 'text/html' },
    })(() => {
      const { contentIs } = useBody()
      expect(contentIs('json')).toBe(false)
      expect(contentIs('xml')).toBe(false)
      expect(contentIs('html')).toBe(true)
      expect(contentIs('text')).toBe(false)
      expect(contentIs('binary')).toBe(false)
      expect(contentIs('form-data')).toBe(false)
      expect(contentIs('urlencoded')).toBe(false)
    })
  })

  it('must detect content-type text/plain', () => {
    prepareTestHttpContext({
      url: '',
      headers: { 'content-type': 'text/plain' },
    })(() => {
      const { contentIs } = useBody()
      expect(contentIs('json')).toBe(false)
      expect(contentIs('xml')).toBe(false)
      expect(contentIs('html')).toBe(false)
      expect(contentIs('text')).toBe(true)
      expect(contentIs('binary')).toBe(false)
      expect(contentIs('form-data')).toBe(false)
      expect(contentIs('urlencoded')).toBe(false)
    })
  })

  it('must detect content-type application/octet-stream', () => {
    prepareTestHttpContext({
      url: '',
      headers: { 'content-type': 'application/octet-stream' },
    })(() => {
      const { contentIs } = useBody()
      expect(contentIs('json')).toBe(false)
      expect(contentIs('xml')).toBe(false)
      expect(contentIs('html')).toBe(false)
      expect(contentIs('text')).toBe(false)
      expect(contentIs('binary')).toBe(true)
      expect(contentIs('form-data')).toBe(false)
      expect(contentIs('urlencoded')).toBe(false)
    })
  })

  it('must detect content-type multipart/form-data', () => {
    prepareTestHttpContext({
      url: '',
      headers: { 'content-type': 'multipart/form-data' },
    })(() => {
      const { contentIs } = useBody()
      expect(contentIs('json')).toBe(false)
      expect(contentIs('xml')).toBe(false)
      expect(contentIs('html')).toBe(false)
      expect(contentIs('text')).toBe(false)
      expect(contentIs('binary')).toBe(false)
      expect(contentIs('form-data')).toBe(true)
      expect(contentIs('urlencoded')).toBe(false)
    })
  })

  it('must detect content-type application/x-www-form-urlencoded', () => {
    prepareTestHttpContext({
      url: '',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    })(() => {
      const { contentIs } = useBody()
      expect(contentIs('json')).toBe(false)
      expect(contentIs('xml')).toBe(false)
      expect(contentIs('html')).toBe(false)
      expect(contentIs('text')).toBe(false)
      expect(contentIs('binary')).toBe(false)
      expect(contentIs('form-data')).toBe(false)
      expect(contentIs('urlencoded')).toBe(true)
    })
  })

  it('must support custom MIME types', () => {
    prepareTestHttpContext({
      url: '',
      headers: { 'content-type': 'application/msgpack' },
    })(() => {
      const { contentIs } = useBody()
      expect(contentIs('application/msgpack')).toBe(true)
      expect(contentIs('json')).toBe(false)
    })
  })

  it('must parse body json', async () => {
    const bodyValue = JSON.stringify({ test: 'object', a: 123 })
    await prepareTestHttpContext({
      url: '',
      headers: { 'content-type': 'application/json' },
      rawBody: bodyValue,
    })(async () => {
      const { parseBody } = useBody()
      expect(await parseBody()).toEqual({ test: 'object', a: 123 })
    })
  })

  it('must parse body form-data', async () => {
    const bodyValue = `----------------------------038816476509113988597354
Content-Disposition: form-data; name="x2[]"

22
----------------------------038816476509113988597354
Content-Disposition: form-data; name="x3"

33
----------------------------038816476509113988597354
Content-Disposition: form-data; name="x2[]"

44%25
----------------------------038816476509113988597354--
`
    await prepareTestHttpContext({
      url: '',
      headers: {
        'content-type':
          'multipart/form-data; boundary=--------------------------038816476509113988597354',
      },
      rawBody: bodyValue,
    })(async () => {
      const { parseBody } = useBody()
      expect(await parseBody()).toEqual({
        'x2[]': '22\n44%25',
        x3: '33',
      })
    })
  })

  it('must parse body form-data with json', async () => {
    const bodyValue = `----------------------------038816476509113988597354
Content-Disposition: form-data; name="x3"

33
----------------------------038816476509113988597354
Content-Type: application/json
Content-Disposition: form-data; name="x4"

{ "a": "b" }
----------------------------038816476509113988597354--
`
    await prepareTestHttpContext({
      url: '',
      headers: {
        'content-type':
          'multipart/form-data; boundary=--------------------------038816476509113988597354',
      },
      rawBody: bodyValue,
    })(async () => {
      const { parseBody } = useBody()
      expect(await parseBody()).toEqual({
        x3: '33',
        x4: { a: 'b' },
      })
    })
  })

  it('must parse body x-www-form-urlencoded', async () => {
    const bodyValue = 't1=11&t2=2'
    await prepareTestHttpContext({
      url: '',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      rawBody: bodyValue,
    })(async () => {
      const { parseBody } = useBody()
      expect(await parseBody()).toEqual({
        t1: '11',
        t2: '2',
      })
    })
  })
})
