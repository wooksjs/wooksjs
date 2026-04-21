import { current } from '@wooksjs/event-core'
import { IncomingMessage, ServerResponse } from 'http'
import { Socket } from 'net'
import { describe, expect, it } from 'vitest'

import { useRequest } from '../../composables'
import { HttpError } from '../../errors'
import { WooksHttpResponse } from '../../response/wooks-http-response'
import { prepareTestHttpContext } from '../../testing'
import { WooksURLSearchParams } from '../url-search-params'

describe('url-search-params', () => {
  const sp = new WooksURLSearchParams('a[]=1&a[]=2&b=3&c=4&encoded=%7e%20%25')

  it('must parse search params', () => {
    expect(sp.toJson()).toEqual({
      'a[]': ['1', '2'],
      b: '3',
      c: '4',
      encoded: '~ %',
    })
  })

  it('must render HttpError from duplicate attacker-controlled keys as escaped HTML (XSS regression)', () => {
    const runInContext = prepareTestHttpContext({ url: '' })
    runInContext(() => {
      useRequest().headers.accept = 'text/html'
      const payload = '<img src=x onerror=alert(1)>'
      const attackerSp = new WooksURLSearchParams(
        `${encodeURIComponent(payload)}=1&${encodeURIComponent(payload)}=2`,
      )
      let caught: unknown
      try {
        attackerSp.toJson()
      } catch (error) {
        caught = error
      }
      expect(caught).toBeInstanceOf(HttpError)
      const req = new IncomingMessage(new Socket({}))
      const res = new ServerResponse(req)
      const response = new WooksHttpResponse(res, req, console as any)
      ;(response as any).renderError((caught as HttpError).body, current())
      const body = response.body as string
      expect(body).not.toContain(payload)
      expect(body).toContain('&lt;img src=x onerror=alert(1)&gt;')
    })
  })
})
