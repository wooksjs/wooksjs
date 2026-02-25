import { describe, expect, it } from 'vitest'

import { prepareTestHttpContext } from '@wooksjs/event-http'
import { useBody } from '../body'

describe('body', () => {
  it('must detect content-type application/json', () => {
    prepareTestHttpContext({
      url: '',
      headers: { 'content-type': 'application/json' },
    })(() => {
      const { is } = useBody()
      expect(is('json')).toBe(true)
      expect(is('xml')).toBe(false)
      expect(is('html')).toBe(false)
      expect(is('text')).toBe(false)
      expect(is('binary')).toBe(false)
      expect(is('form-data')).toBe(false)
      expect(is('urlencoded')).toBe(false)
    })
  })

  it('must detect content-type text/xml', () => {
    prepareTestHttpContext({
      url: '',
      headers: { 'content-type': 'text/xml' },
    })(() => {
      const { is } = useBody()
      expect(is('json')).toBe(false)
      expect(is('xml')).toBe(true)
      expect(is('html')).toBe(false)
      expect(is('text')).toBe(false)
      expect(is('binary')).toBe(false)
      expect(is('form-data')).toBe(false)
      expect(is('urlencoded')).toBe(false)
    })
  })

  it('must detect content-type text/html', () => {
    prepareTestHttpContext({
      url: '',
      headers: { 'content-type': 'text/html' },
    })(() => {
      const { is } = useBody()
      expect(is('json')).toBe(false)
      expect(is('xml')).toBe(false)
      expect(is('html')).toBe(true)
      expect(is('text')).toBe(false)
      expect(is('binary')).toBe(false)
      expect(is('form-data')).toBe(false)
      expect(is('urlencoded')).toBe(false)
    })
  })

  it('must detect content-type text/plain', () => {
    prepareTestHttpContext({
      url: '',
      headers: { 'content-type': 'text/plain' },
    })(() => {
      const { is } = useBody()
      expect(is('json')).toBe(false)
      expect(is('xml')).toBe(false)
      expect(is('html')).toBe(false)
      expect(is('text')).toBe(true)
      expect(is('binary')).toBe(false)
      expect(is('form-data')).toBe(false)
      expect(is('urlencoded')).toBe(false)
    })
  })

  it('must detect content-type application/octet-stream', () => {
    prepareTestHttpContext({
      url: '',
      headers: { 'content-type': 'application/octet-stream' },
    })(() => {
      const { is } = useBody()
      expect(is('json')).toBe(false)
      expect(is('xml')).toBe(false)
      expect(is('html')).toBe(false)
      expect(is('text')).toBe(false)
      expect(is('binary')).toBe(true)
      expect(is('form-data')).toBe(false)
      expect(is('urlencoded')).toBe(false)
    })
  })

  it('must detect content-type multipart/form-data', () => {
    prepareTestHttpContext({
      url: '',
      headers: { 'content-type': 'multipart/form-data' },
    })(() => {
      const { is } = useBody()
      expect(is('json')).toBe(false)
      expect(is('xml')).toBe(false)
      expect(is('html')).toBe(false)
      expect(is('text')).toBe(false)
      expect(is('binary')).toBe(false)
      expect(is('form-data')).toBe(true)
      expect(is('urlencoded')).toBe(false)
    })
  })

  it('must detect content-type application/x-www-form-urlencoded', () => {
    prepareTestHttpContext({
      url: '',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    })(() => {
      const { is } = useBody()
      expect(is('json')).toBe(false)
      expect(is('xml')).toBe(false)
      expect(is('html')).toBe(false)
      expect(is('text')).toBe(false)
      expect(is('binary')).toBe(false)
      expect(is('form-data')).toBe(false)
      expect(is('urlencoded')).toBe(true)
    })
  })

  it('must support custom MIME types', () => {
    prepareTestHttpContext({
      url: '',
      headers: { 'content-type': 'application/msgpack' },
    })(() => {
      const { is } = useBody()
      expect(is('application/msgpack')).toBe(true)
      expect(is('json')).toBe(false)
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
