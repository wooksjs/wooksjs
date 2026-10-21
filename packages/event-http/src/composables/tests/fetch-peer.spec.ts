import { useLocale } from '@wooksjs/event-core'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { Wooks } from 'wooks'

import { createHttpApp } from '../../http-adapter'
import type { TWooksHttpOptions, WooksHttp } from '../../http-adapter'
import type { TTrustProxy } from '../../utils/proxy'
import { useRequest } from '../request'

/*
 * Programmatic `app.fetch()` peer contract (review H2, L11):
 *  - inside a request (caller context): the inner request inherits the caller's resolved
 *    client, protocol, host — and locale;
 *  - with no caller: the peer is UNKNOWN — list and predicate trust never read forwarding
 *    headers (a hop count still trusts whatever is in front); protocol and host come from
 *    the Request URL;
 *  - `app.fetch(request, { remoteAddress, encrypted })` supplies the real peer (fetch runtimes).
 */

const quiet = { info() {}, warn() {}, error() {}, log() {}, debug() {}, trace() {} } as never
const forged = {
  'x-forwarded-for': '6.6.6.6',
  'x-forwarded-proto': 'https',
  'x-forwarded-host': 'evil.example',
}

function who() {
  const r = useRequest()
  return { ip: r.getIp(), protocol: r.protocol(), host: r.host() }
}

function makeApp(opts: TWooksHttpOptions = {}) {
  const app = createHttpApp({ logger: quiet, ...opts }, new Wooks())
  app.get('/who', who)
  app.get('/legacy', () => ({ ip: useRequest().getIp({ trustProxy: true }) }))
  app.get('/locale', () => ({ locale: useLocale().get() ?? null }))
  return app
}

const predicate = vi.fn((_addr: string) => true)
const TRUSTS: Record<string, TTrustProxy> = {
  none: false,
  'hop count 1': 1,
  loopback: 'loopback',
  "['127.0.0.1']": ['127.0.0.1'],
  predicate,
}

describe('app.fetch() with no caller: the peer is unknown', () => {
  for (const [name, trustProxy] of Object.entries(TRUSTS)) {
    it(`${name}: ${name === 'hop count 1' ? 'a hop count trusts whatever is in front' : 'forwarding headers are never read'}`, async () => {
      predicate.mockClear()
      const app = makeApp({ trustProxy })
      const res = await app.fetch(new Request('https://app.example:8443/who', { headers: forged }))
      const got = await res!.json()
      if (name === 'hop count 1') {
        expect(got).toEqual({ ip: '6.6.6.6', protocol: 'https', host: 'evil.example' })
      } else {
        expect(got).toEqual({ ip: '', protocol: 'https', host: 'app.example:8443' })
      }
      expect(predicate).not.toHaveBeenCalled()
    })
  }

  it('protocol and host come from the Request URL', async () => {
    const app = makeApp()
    expect(await (await app.fetch(new Request('https://app.example/who')))!.json()).toEqual({
      ip: '',
      protocol: 'https',
      host: 'app.example',
    })
    expect(await (await app.request('/who'))!.json()).toEqual({
      ip: '',
      protocol: 'http',
      host: 'localhost',
    })
  })

  it('deprecated getIp({ trustProxy: true }) never trusts an unknown peer', async () => {
    const app = makeApp()
    const res = await app.fetch(new Request('http://x/legacy', { headers: forged }))
    expect(await res!.json()).toEqual({ ip: '' })
  })
})

describe('app.fetch(request, { remoteAddress, encrypted }): the runtime supplies the peer', () => {
  const cases: Array<
    [string, TTrustProxy, string, { ip: string; protocol: string; host: string }]
  > = [
    ['none', false, '127.0.0.1', { ip: '127.0.0.1', protocol: 'https', host: 'app.example' }],
    [
      'loopback, trusted peer',
      'loopback',
      '127.0.0.1',
      { ip: '6.6.6.6', protocol: 'https', host: 'evil.example' },
    ],
    [
      'loopback, untrusted peer',
      'loopback',
      '203.0.113.9',
      { ip: '203.0.113.9', protocol: 'https', host: 'app.example' },
    ],
    [
      'predicate',
      (a) => a === '10.0.0.1',
      '::ffff:10.0.0.1',
      { ip: '6.6.6.6', protocol: 'https', host: 'evil.example' },
    ],
  ]
  it.each(cases)('%s', async (_name, trustProxy, remoteAddress, expected) => {
    const app = makeApp({ trustProxy })
    const res = await app.fetch(new Request('http://app.example/who', { headers: forged }), {
      remoteAddress,
      encrypted: true,
    })
    expect(await res!.json()).toEqual(expected)
  })

  it('deprecated getIp({ trustProxy: true }) trusts one hop of a known peer', async () => {
    const app = makeApp()
    const res = await app.fetch(new Request('http://x/legacy', { headers: forged }), {
      remoteAddress: '10.0.0.1',
    })
    expect(await res!.json()).toEqual({ ip: '6.6.6.6' })
  })
})

describe('app.fetch() inside a request inherits the caller', () => {
  const servers: WooksHttp[] = []
  afterAll(() => Promise.all(servers.map((s) => s.close())))

  async function outerWith(outerOpts: TWooksHttpOptions, inner: WooksHttp) {
    const outer = createHttpApp({ logger: quiet, ...outerOpts }, new Wooks())
    outer.get('/ssr', async () => ({
      outer: who(),
      inner: await (await inner.fetch(new Request('http://internal/who')))!.json(),
      outerLocale: useLocale().get() ?? null,
      innerLocale: (await (await inner.fetch(new Request('http://internal/locale')))!.json())
        .locale,
    }))
    await outer.listen(0, '127.0.0.1')
    servers.push(outer)
    const port = (outer.getServer()!.address() as { port: number }).port
    return (headers: Record<string, string>) =>
      fetch(`http://127.0.0.1:${port}/ssr`, { headers }).then((r) => r.json())
  }

  for (const [name, trustProxy] of Object.entries(TRUSTS)) {
    it(`identity — outer trust ${name}, inner trusts loopback`, async () => {
      const get = await outerWith({ trustProxy }, makeApp({ trustProxy: 'loopback' }))
      const r = await get(forged)
      expect(r.inner).toEqual(r.outer)
    })
  }

  it('locale: the caller’s locale wins over the inner app’s resolver', async () => {
    const inner = makeApp({ resolveLocale: () => 'inner-default' })
    const get = await outerWith({ resolveLocale: () => 'de' }, inner)
    expect(await get({})).toMatchObject({ outerLocale: 'de', innerLocale: 'de' })
  })

  it('locale: a caller without a locale leaves the inner resolver in charge', async () => {
    const inner = makeApp({ resolveLocale: () => 'inner-default' })
    const get = await outerWith({}, inner)
    expect(await get({})).toMatchObject({ outerLocale: null, innerLocale: 'inner-default' })
  })
})
