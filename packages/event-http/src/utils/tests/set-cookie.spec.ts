import { describe, expect, it } from 'vitest'

import { renderCookie } from '../set-cookie'

describe('set-cookie', () => {
  it('must set cookie key-value pair', () => {
    expect(renderCookie('cookie-key', { value: 'cookie-value', attrs: {} })).toEqual(
      'cookie-key=cookie-value',
    )
  })
  it('must set "expires"', () => {
    expect(
      renderCookie('cookie-key', {
        value: 'cookie-value',
        attrs: { expires: '2020-02-02' },
      }),
    ).toEqual('cookie-key=cookie-value; Expires=Sun, 02 Feb 2020 00:00:00 GMT')
  })
  it('must set "maxAge"', () => {
    expect(
      renderCookie('cookie-key', {
        value: 'cookie-value',
        attrs: { maxAge: '15m' },
      }),
    ).toEqual('cookie-key=cookie-value; Max-Age=900')
  })
  it('must set "domain"', () => {
    expect(
      renderCookie('cookie-key', {
        value: 'cookie-value',
        attrs: { domain: 'my-domain' },
      }),
    ).toEqual('cookie-key=cookie-value; Domain=my-domain')
  })
  it('must set "path"', () => {
    expect(
      renderCookie('cookie-key', {
        value: 'cookie-value',
        attrs: { path: '/my-path' },
      }),
    ).toEqual('cookie-key=cookie-value; Path=/my-path')
  })
  it('must set "secure"', () => {
    expect(
      renderCookie('cookie-key', {
        value: 'cookie-value',
        attrs: { secure: true },
      }),
    ).toEqual('cookie-key=cookie-value; Secure')
  })
  it('must set "httpOnly"', () => {
    expect(
      renderCookie('cookie-key', {
        value: 'cookie-value',
        attrs: { httpOnly: true },
      }),
    ).toEqual('cookie-key=cookie-value; HttpOnly')
  })
  it('must set "sameSite"', () => {
    expect(
      renderCookie('cookie-key', {
        value: 'cookie-value',
        attrs: { sameSite: true },
      }),
    ).toEqual('cookie-key=cookie-value; SameSite=Strict')
  })
  it('must set "sameSite" = Lax', () => {
    expect(
      renderCookie('cookie-key', {
        value: 'cookie-value',
        attrs: { sameSite: 'Lax' },
      }),
    ).toEqual('cookie-key=cookie-value; SameSite=Lax')
  })
  it('omits attrs whose value is undefined', () => {
    expect(
      renderCookie('k', {
        value: 'v',
        attrs: {
          httpOnly: true,
          domain: undefined,
          path: undefined,
          expires: undefined,
          maxAge: undefined,
        },
      }),
    ).toEqual('k=v; HttpOnly')
  })
  it('still emits Max-Age=0 for cookie deletion', () => {
    expect(renderCookie('k', { value: '', attrs: { maxAge: 0 } })).toEqual('k=; Max-Age=0')
  })
  it('URI-encodes values exactly like encodeURIComponent()', () => {
    for (const value of [
      "A-Za-z0-9_.!~*'()",
      'with space',
      'a;b=c,d',
      'ünïcode',
      '%41',
      'eyJhbGciOiJIUzI1NiJ9.e30.sig+/=',
    ]) {
      expect(renderCookie('k', { value, attrs: {} })).toEqual(`k=${encodeURIComponent(value)}`)
    }
  })
  it('renders non-string values like encodeURIComponent()', () => {
    expect(renderCookie('k', { value: 42 as unknown as string, attrs: {} })).toEqual('k=42')
    expect(renderCookie('k', { value: undefined as unknown as string, attrs: {} })).toEqual(
      'k=undefined',
    )
    for (const v of [0, -1, 1.5, Number.NaN, true, false, null, 10n, {}, [1, 2], '', ' ']) {
      expect(renderCookie('k', { value: v as unknown as string, attrs: {} })).toEqual(
        `k=${encodeURIComponent(v as string)}`,
      )
    }
  })
  it('strips ";" and line breaks from path and domain', () => {
    expect(
      renderCookie('k', {
        value: 'v',
        attrs: { path: '/a;\r\nInjected=1', domain: 'x.com;\nSecure' },
      }),
    ).toEqual('k=v; Path=/aInjected=1; Domain=x.comSecure')
  })
  it('renders attributes in the order they were given', () => {
    expect(
      renderCookie('k', { value: 'v', attrs: { secure: true, path: '/', httpOnly: true } }),
    ).toEqual('k=v; Secure; Path=/; HttpOnly')
  })
  it('throws for an unknown attribute', () => {
    expect(() =>
      renderCookie('k', { value: 'v', attrs: { path: '/', bogus: 1 } as never }),
    ).toThrow('Unknown Set-Cookie attribute bogus')
  })
})

function outcome(fn: () => string): string {
  try {
    return `ok:${fn()}`
  } catch (error) {
    return `throw:${(error as Error).name}`
  }
}

describe('set-cookie differential', () => {
  it('encodes values and sanitizes attributes like the reference for every code point', () => {
    const inputs: string[] = ['😀', '\uD800', 'a\uDFFFb']
    for (let cp = 0; cp <= 0xffff; cp++) {
      inputs.push(String.fromCodePoint(cp))
    }
    for (const ch of inputs) {
      const a = outcome(() => renderCookie('k', { value: ch, attrs: { path: ch } }))
      const b = outcome(() => `k=${encodeURIComponent(ch)}; Path=${ch.replace(/[;\r\n]/g, '')}`)
      if (a !== b) {
        expect(a).toBe(b)
      }
    }
  })
})
