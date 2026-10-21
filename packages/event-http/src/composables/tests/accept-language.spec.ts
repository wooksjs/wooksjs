import { current, EventContext, run, useLocale } from '@wooksjs/event-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Wooks } from 'wooks'

import { createHttpApp } from '../../http-adapter'
import type { WooksHttp } from '../../http-adapter'
import { prepareTestHttpContext } from '../../testing'
import { useAcceptLanguage } from '../header-accept-language'
import { useResponse } from '../response'

/*
 * negotiate(available, fallback?) contract — RFC 4647 lookup (truncation) plus basic filtering
 * (prefix), over RFC 9110 §12.5.4 ranges:
 *  - ranges are tried by q (desc), then header order; q=0 marks a range "not acceptable";
 *  - for a range: an exact tag (case-insensitive), else the first available tag it is a prefix
 *    of (`en` → `en-US`), else its truncations (`de-CH-1996` → `de-CH` → `de`); `*` = the first
 *    available tag that is not excluded;
 *  - the result is spelled as in `available`; no match → `fallback` (or undefined);
 *  - every call adds `Vary: Accept-Language` to the response.
 */

function negotiate(header: string | undefined, available: string[], fallback?: string) {
  const headers: Record<string, string> = header === undefined ? {} : { 'accept-language': header }
  return prepareTestHttpContext({ url: '/', headers })(() => ({
    result:
      fallback === undefined
        ? useAcceptLanguage().negotiate(available)
        : useAcceptLanguage().negotiate(available, fallback),
    vary: useResponse().getHeader('vary'),
  }))
}

describe('useAcceptLanguage().negotiate', () => {
  it.each([
    ['de-DE,de;q=0.9,en;q=0.8', ['en', 'de'], 'de'],
    ['de-CH', ['en', 'de'], 'de'], // truncation
    ['de-CH-1996', ['de-CH', 'de'], 'de-CH'], // longest truncation first
    ['en', ['de', 'en-US', 'en-GB'], 'en-US'], // range is a prefix of an available tag
    ['EN-us', ['en-US'], 'en-US'], // case-insensitive, spelled as available
    ['fr;q=0.5, en;q=0.9', ['fr', 'en'], 'en'], // by q, not header order
    ['fr, en', ['en', 'fr'], 'fr'], // equal q: header order
    ['*', ['ru', 'en'], 'ru'],
    ['ru;q=0, *', ['ru', 'en'], 'en'], // q=0 excludes, also from *
    ['en;q=0', ['en'], undefined],
    ['en;q=0, en-US', ['en-US', 'de'], undefined], // q=0 on a range excludes every tag it covers
    ['xx, yy', ['en'], undefined],
    ['', ['en'], undefined],
    ['en;q=abc, de', ['en', 'de'], 'de'], // malformed q → range skipped
    ['enx', ['en'], undefined], // a prefix must end at a subtag boundary
    ['zh-Hant-TW', ['zh-Hans', 'zh-Hant'], 'zh-Hant'],
  ])('%j over %j → %j', (header, available, expected) => {
    expect(negotiate(header, available).result).toBe(expected)
  })

  it('falls back when nothing matches (or the header is missing)', () => {
    expect(negotiate('xx', ['en', 'de'], 'en').result).toBe('en')
    expect(negotiate(undefined, ['en', 'de'], 'de').result).toBe('de')
    expect(negotiate(undefined, ['en', 'de']).result).toBeUndefined()
  })

  it('adds Vary: Accept-Language on every call, merging with existing values', () => {
    expect(negotiate('de', ['de']).vary).toBe('Accept-Language')
    expect(negotiate(undefined, ['de'], 'de').vary).toBe('Accept-Language')
    const merged = prepareTestHttpContext({ url: '/', headers: { 'accept-language': 'de' } })(
      () => {
        useResponse().setHeader('Vary', 'Cookie')
        useAcceptLanguage().negotiate(['de'])
        useAcceptLanguage().negotiate(['de'])
        return useResponse().headers()
      },
    )
    expect(merged).toMatchObject({ vary: 'Cookie, Accept-Language' }) // header names are stored lower-case
  })

  it('does not add Vary unless negotiate() is used', () => {
    const vary = prepareTestHttpContext({ url: '/', headers: { 'accept-language': 'de' } })(() => {
      useAcceptLanguage().languages()
      return useResponse().getHeader('vary')
    })
    expect(vary).toBeUndefined()
  })

  it('languages() lists the ranges by preference', () => {
    const langs = prepareTestHttpContext({
      url: '/',
      headers: { 'accept-language': 'fr;q=0.5, en-GB, de;q=0.8, ru;q=0' },
    })(() => useAcceptLanguage().languages())
    expect(langs).toEqual(['en-GB', 'de', 'fr'])
  })

  it('invariant: the result is always an available tag or the fallback (2000 random headers)', () => {
    const tags = ['en', 'en-US', 'en-GB', 'de', 'de-CH', 'fr', 'zh-Hant', 'pt-BR', '*', 'xx']
    let seed = 7
    const rnd = () => (seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648) / 2_147_483_648
    for (let i = 0; i < 2000; i++) {
      const parts = Array.from({ length: Math.floor(rnd() * 4) }, () => {
        const tag = tags[Math.floor(rnd() * tags.length)]
        const q = rnd() < 0.5 ? '' : `;q=${(Math.floor(rnd() * 11) / 10).toFixed(1)}`
        return tag + q
      })
      const available = tags.filter((t) => t !== '*' && rnd() < 0.4)
      const header = parts.join(', ')
      const { result } = negotiate(header, available, 'FALLBACK')
      expect([...available, 'FALLBACK']).toContain(result)
      // never a language the client marked unacceptable
      if (result !== 'FALLBACK') {
        const zero = parts
          .filter((p) => p.endsWith(';q=0.0'))
          .map((p) => p.split(';')[0].toLowerCase())
        expect(zero).not.toContain(result!.toLowerCase())
      }
    }
  })
})

describe('createHttpApp({ resolveLocale })', () => {
  let app: WooksHttp
  let base: string
  const calls: string[] = []

  beforeAll(async () => {
    app = createHttpApp(
      {
        resolveLocale: () => {
          calls.push('resolve')
          return useAcceptLanguage().negotiate(['en', 'de', 'ru'], 'en')
        },
      },
      new Wooks(),
    )
    app.get('/locale', () => ({ locale: useLocale().get() }))
    app.get('/child', () => {
      // e.g. a workflow step: a child event context of the request
      const child = new EventContext({ logger: console as never, parent: current() })
      return { locale: run(child, () => useLocale().get()) }
    })
    app.get('/untouched', () => 'no locale read')
    await app.listen(0, '127.0.0.1')
    base = `http://127.0.0.1:${(app.getServer()!.address() as { port: number }).port}`
  })
  afterAll(() => app.close())

  it('resolves the locale lazily per request, with Vary', async () => {
    const res = await fetch(`${base}/locale`, { headers: { 'accept-language': 'ru-RU,ru;q=0.9' } })
    expect(await res.json()).toEqual({ locale: 'ru' })
    expect(res.headers.get('vary')).toBe('Accept-Language')
  })

  it('child event contexts read the request locale', async () => {
    const res = await fetch(`${base}/child`, { headers: { 'accept-language': 'de' } })
    expect(await res.json()).toEqual({ locale: 'de' })
  })

  it('is not run (and adds no Vary) when nothing reads the locale', async () => {
    calls.length = 0
    const res = await fetch(`${base}/untouched`, { headers: { 'accept-language': 'de' } })
    expect(await res.text()).toBe('no locale read')
    expect(calls).toEqual([])
    expect(res.headers.get('vary')).toBeNull()
  })
})
