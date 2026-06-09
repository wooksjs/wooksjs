import { describe, expect, it } from 'vitest'

import {
  applyProxyControls,
  CookiesIterable,
  HeadersIterable,
  resolveProxyTarget,
} from './proxy-utils'

describe('event-http/proxy', () => {
  describe('resolveProxyTarget (SSRF host-hijack protection)', () => {
    const base = 'https://backend.example.com'
    // attacker-controlled request paths concatenated onto a fixed base host,
    // as in the documented `proxy(base + useRequest().url)` pattern
    const hijackAttempts = [
      '//evil.com/p',
      '/\\evil.com/p',
      '/\\@evil.com/p',
      '/..//@evil.com',
      '/@evil.com/p',
    ]
    it('must keep the host fixed to the parsed target for all path-based hijack attempts', () => {
      for (const attack of hijackAttempts) {
        const resolved = resolveProxyTarget(base + attack)
        expect(resolved.host).toBe('backend.example.com')
      }
    })
    it('must preserve a legitimate path and query string', () => {
      expect(resolveProxyTarget(`${base}/api/users?id=5`).toString()).toBe(
        'https://backend.example.com/api/users?id=5',
      )
    })
    it('must strip the fragment', () => {
      expect(resolveProxyTarget(`${base}/api#frag`).hash).toBe('')
    })
    it('must reject non-http(s) protocols', () => {
      expect(() => resolveProxyTarget('file:///etc/passwd')).toThrow()
      expect(() => resolveProxyTarget('ftp://host/x')).toThrow()
    })
    it('must reject an invalid target URL', () => {
      expect(() => resolveProxyTarget('not a url')).toThrow()
    })
  })

  describe('resolveProxyTarget (allowedHosts)', () => {
    it('must allow a host on the allowlist (string, case-insensitive)', () => {
      expect(resolveProxyTarget('https://API.Example.com/x', ['api.example.com']).hostname).toBe(
        'api.example.com',
      )
    })
    it('must allow a host matching an allowlist RegExp', () => {
      expect(
        resolveProxyTarget('https://svc-1.internal/x', [/^svc-\d+\.internal$/u]).hostname,
      ).toBe('svc-1.internal')
    })
    it('must reject a host not on the allowlist', () => {
      expect(() => resolveProxyTarget('https://evil.com/x', ['api.example.com'])).toThrow()
    })
    it('must deny every host when the allowlist is empty', () => {
      expect(() => resolveProxyTarget('https://api.example.com/x', [])).toThrow()
    })
    it('must apply no restriction when allowedHosts is undefined', () => {
      expect(resolveProxyTarget('https://anything.example.com/x').hostname).toBe(
        'anything.example.com',
      )
    })
    it('must reject a hijacked host even if the intended base is allowlisted', () => {
      // defense-in-depth: path-based hijack would resolve to the base host anyway,
      // but the allowlist also blocks any host that is not explicitly permitted
      expect(() =>
        resolveProxyTarget('https://backend.example.com', ['nope.example.com']),
      ).toThrow()
    })
  })
  const headers = {
    'content-type': 'application/json',
    'content-length': '256',
    accept: '*',
  }
  const cookies =
    'cookie-name-1=my%20value%201; Expires=Tue, 03 Jan 2023 00:00:00 GMT, cookie-name-2=my%20value%201; Expires=Tue, 03-Jan-2023 00:00:00 GMT, another-cookie=my%20value%202'
  describe('CookiesIterable', () => {
    it('must iterate over cookies', () => {
      const check = [
        ['cookie-name-1', 'my%20value%201; Expires=Tue, 03 Jan 2023 00:00:00 GMT'],
        ['cookie-name-2', 'my%20value%201; Expires=Tue, 03-Jan-2023 00:00:00 GMT'],
        ['another-cookie', 'my%20value%202'],
      ]
      const data = new CookiesIterable(cookies)
      let i = 0
      for (const [name, value] of data) {
        const [n, v] = check[i++]
        expect(name).toBe(n)
        expect(value).toBe(v)
      }
      expect(i).toBe(check.length)
    })
  })
  describe('HeadersIterable', () => {
    it('must iterate over headers object', () => {
      const check = [
        ['content-type', 'application/json'],
        ['content-length', '256'],
        ['accept', '*'],
      ]
      const data = new HeadersIterable(headers)
      let i = 0
      for (const [name, value] of data) {
        const [n, v] = check[i++]
        expect(name).toBe(n)
        expect(value).toBe(v)
      }
    })
  })
  describe('applyProxyControls', () => {
    it('must pass all the headers when controls are empty', () => {
      expect(applyProxyControls(new HeadersIterable(headers), {})).toEqual(headers)
    })
    it('must pass all the headers when allowList = "*"', () => {
      expect(
        applyProxyControls(new HeadersIterable(headers), {
          allow: '*',
        }),
      ).toEqual(headers)
    })
    it('must filter by allowList (string[])', () => {
      expect(
        applyProxyControls(new HeadersIterable(headers), {
          allow: ['accept'],
        }),
      ).toEqual({ accept: '*' })
    })
    it('must filter by allowList (regexp[])', () => {
      expect(
        applyProxyControls(new HeadersIterable(headers), {
          allow: [/^a/u],
        }),
      ).toEqual({ accept: '*' })
    })
    it('must filter by allowList (regexp | stirng[])', () => {
      expect(
        applyProxyControls(new HeadersIterable(headers), {
          allow: [/type$/u, 'accept'],
        }),
      ).toEqual({ accept: '*', 'content-type': 'application/json' })
    })
    it('must block headers from blocklist (string[])', () => {
      expect(
        applyProxyControls(new HeadersIterable(headers), {
          allow: '*',
          block: ['content-type', 'content-length'],
        }),
      ).toEqual({ accept: '*' })
    })
    it('must block headers from blocklist (regexp[])', () => {
      expect(
        applyProxyControls(new HeadersIterable(headers), {
          allow: '*',
          block: [/content/u],
        }),
      ).toEqual({ accept: '*' })
    })
    it('must block headers from blocklist (string | regexp[])', () => {
      expect(
        applyProxyControls(new HeadersIterable(headers), {
          allow: '*',
          block: [/type$/u, /length$/u],
        }),
      ).toEqual({ accept: '*' })
    })
    it('must block all *', () => {
      expect(
        applyProxyControls(new HeadersIterable(headers), {
          allow: '*',
          block: '*',
        }),
      ).toEqual({})
    })
    it('must overwrite object', () => {
      expect(
        applyProxyControls(new HeadersIterable(headers), {
          allow: ['accept'],
          overwrite: { accept: 'text/plain' },
        }),
      ).toEqual({ accept: 'text/plain' })
    })
    it('must overwrite with callback', () => {
      expect(
        applyProxyControls(new HeadersIterable(headers), {
          allow: ['accept'],
          overwrite: (o) => ({ ...o, accept: 'text/plain' }),
        }),
      ).toEqual({ accept: 'text/plain' })
    })
    it('must pass all cookies allowList = "*"', () => {
      expect(
        applyProxyControls(new CookiesIterable(cookies), {
          allow: '*',
        }),
      ).toEqual({
        'cookie-name-1': 'my%20value%201; Expires=Tue, 03 Jan 2023 00:00:00 GMT',
        'cookie-name-2': 'my%20value%201; Expires=Tue, 03-Jan-2023 00:00:00 GMT',
        'another-cookie': 'my%20value%202',
      })
    })
    it('must filter cookies by allowList (string[])', () => {
      expect(
        applyProxyControls(new CookiesIterable(cookies), {
          allow: ['cookie-name-1'],
        }),
      ).toEqual({
        'cookie-name-1': 'my%20value%201; Expires=Tue, 03 Jan 2023 00:00:00 GMT',
      })
    })
  })
})
