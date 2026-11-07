import { afterEach, describe, expect, it } from 'vitest'
import { Wooks } from 'wooks'

import { createHttpApp } from '../../http-adapter'
import type { TWooksHttpOptions, WooksHttp } from '../../http-adapter'
import { compileTrustProxy, resolveForwarded } from '../../utils/proxy'
import { useRequest } from '../request'

/*
 * App-level proxy trust: `getIp()`, `protocol()` and `host()` all come from ONE resolver
 * (`resolveForwarded`) driven by `trustProxy` / `proxyHeaders`. Default: no proxy trusted.
 */

const quiet = { info() {}, warn() {}, error() {}, log() {}, debug() {}, trace() {} } as never

let app: WooksHttp | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

async function serve(opts: TWooksHttpOptions) {
  app = createHttpApp({ logger: quiet, ...opts }, new Wooks())
  app.get('/who', () => {
    const r = useRequest()
    return { ip: r.getIp(), protocol: r.protocol(), host: r.host() }
  })
  app.get('/legacy', () => ({
    one: useRequest().getIp({ trustProxy: true }),
    none: useRequest().getIp({ trustProxy: false }),
  }))
  app.get('/ssr', async () => {
    // an in-process self-fetch made while handling the client's request
    const inner = await app!.request('/who')
    return inner!.json()
  })
  await app.listen(0, '127.0.0.1')
  const port = (app.getServer()!.address() as { port: number }).port
  return (path: string, headers: Record<string, string> = {}) =>
    fetch(`http://127.0.0.1:${port}${path}`, { headers }).then((r) => r.json())
}

const forged = {
  'x-forwarded-for': '6.6.6.6, 203.0.113.7',
  'x-forwarded-proto': 'https',
  'x-forwarded-host': 'shop.example',
  forwarded: 'for=6.6.6.6;proto=https;host=evil.example',
}

describe('trustProxy (app level)', () => {
  it('default: forwarding headers are ignored', async () => {
    const get = await serve({})
    expect(await get('/who', forged)).toEqual({
      ip: '127.0.0.1',
      protocol: 'http',
      host: expect.stringMatching(/^127\.0\.0\.1:\d+$/u),
    })
  })

  it('a hop count trusts that many proxies; the right-most untrusted hop is the client', async () => {
    const get = await serve({ trustProxy: 1 })
    expect(await get('/who', forged)).toEqual({
      ip: '203.0.113.7',
      protocol: 'https',
      host: 'shop.example',
    })
  })

  it('REGRESSION: a forged left-most X-Forwarded-For entry is never the client', async () => {
    const get = await serve({ trustProxy: 1 })
    const { ip } = await get('/who', { 'x-forwarded-for': '1.1.1.1, 2.2.2.2, 203.0.113.7' })
    expect(ip).toBe('203.0.113.7')
  })

  it('an address list trusts only matching hops', async () => {
    const get = await serve({ trustProxy: ['loopback', '10.0.0.0/8'] })
    expect((await get('/who', { 'x-forwarded-for': '6.6.6.6, 203.0.113.7, 10.1.1.1' })).ip).toBe(
      '203.0.113.7',
    )
  })

  it('an address list that does not match the socket peer trusts nothing', async () => {
    const get = await serve({ trustProxy: ['10.0.0.0/8'] })
    expect(await get('/who', forged)).toMatchObject({ ip: '127.0.0.1', protocol: 'http' })
  })

  it('{ addresses, hops } trusts matching hops up to the cap', async () => {
    const get = await serve({ trustProxy: { addresses: 'loopback', hops: 1 } })
    expect(await get('/who', forged)).toEqual({
      ip: '203.0.113.7',
      protocol: 'https',
      host: 'shop.example',
    })
  })

  it('a predicate gets (address, hopIndex)', async () => {
    const calls: Array<[string, number]> = []
    const get = await serve({
      trustProxy: (addr, i) => {
        calls.push([addr, i])
        return i === 0 || addr === '10.0.0.2'
      },
    })
    expect((await get('/who', { 'x-forwarded-for': '203.0.113.7, 10.0.0.2' })).ip).toBe(
      '203.0.113.7',
    )
    expect(calls).toEqual([
      ['127.0.0.1', 0],
      ['10.0.0.2', 1],
      ['203.0.113.7', 2],
    ])
  })

  it("proxyHeaders: 'forwarded' reads RFC 7239 Forwarded and ignores X-Forwarded-*", async () => {
    const get = await serve({ trustProxy: 1, proxyHeaders: 'forwarded' })
    expect(
      await get('/who', {
        ...forged,
        forwarded:
          'for=6.6.6.6, for="[2001:db8:cafe::17]:4711";proto=https;host="app.example:8443"',
      }),
    ).toEqual({ ip: '2001:db8:cafe::17', protocol: 'https', host: 'app.example:8443' })
  })

  it('deprecated getIp({ trustProxy: true }) trusts ONE hop (right-most), not the left-most entry', async () => {
    const get = await serve({})
    expect(await get('/legacy', { 'x-forwarded-for': '6.6.6.6, 203.0.113.7' })).toEqual({
      one: '203.0.113.7',
      none: '127.0.0.1',
    })
  })

  it('an in-process fetch() inherits the calling request’s resolved client', async () => {
    const get = await serve({ trustProxy: 1 })
    expect(await get('/ssr', forged)).toEqual({
      ip: '203.0.113.7',
      protocol: 'https',
      host: 'shop.example',
    })
  })

  it('rejects invalid settings at construction', () => {
    expect(() => createHttpApp({ trustProxy: true as never }, new Wooks())).toThrow(/use 1/u)
    expect(() => createHttpApp({ trustProxy: -1 }, new Wooks())).toThrow(TypeError)
    expect(() => createHttpApp({ trustProxy: 1.5 }, new Wooks())).toThrow(TypeError)
    expect(() => createHttpApp({ trustProxy: ['10.0.0.0/33'] }, new Wooks())).toThrow(TypeError)
    expect(() => createHttpApp({ trustProxy: ['not-an-ip'] }, new Wooks())).toThrow(TypeError)
    expect(() => createHttpApp({ trustProxy: ['10.0.0.0/'] }, new Wooks())).toThrow(TypeError)
    expect(() => createHttpApp({ proxyHeaders: 'both' as never }, new Wooks())).toThrow(TypeError)
    expect(() =>
      createHttpApp({ trustProxy: { addresses: '10.0.0.0/8', hops: 0 } }, new Wooks()),
    ).toThrow(/'hops' must be an integer >= 1/u)
    expect(() => createHttpApp({ trustProxy: { addresses: [], hops: 1 } }, new Wooks())).toThrow(
      /'addresses' must list at least one/u,
    )
  })
})

describe('trustProxy { addresses, hops }', () => {
  const capped = (addresses: string | string[], hops: number) =>
    compileTrustProxy({ addresses, hops })

  it('an in-range client cannot walk past the cap with entries it wrote itself', () => {
    // one load balancer (10.0.0.1) in front; the client (10.2.3.4) is in the same VPC
    const headers = { 'x-forwarded-for': '10.6.6.6, 10.2.3.4' }
    expect(resolveForwarded(req(headers, '10.0.0.1'), capped('10.0.0.0/8', 1)).ip).toBe('10.2.3.4')
    // the bare list follows the client's own entry
    expect(resolveForwarded(req(headers, '10.0.0.1'), compileTrustProxy('10.0.0.0/8')).ip).toBe(
      '10.6.6.6',
    )
    // two proxies: the cap is 2, and the forged left-most entry is still never reached
    expect(
      resolveForwarded(
        req({ 'x-forwarded-for': '10.6.6.6, 10.2.3.4, 10.0.0.5' }, '10.0.0.1'),
        capped(['10.0.0.0/8'], 2),
      ).ip,
    ).toBe('10.2.3.4')
    // the same with RFC 7239 Forwarded
    expect(
      resolveForwarded(
        req({ forwarded: 'for=10.6.6.6, for=10.2.3.4' }, '10.0.0.1'),
        capped('10.0.0.0/8', 1),
        'forwarded',
      ).ip,
    ).toBe('10.2.3.4')
  })

  it('a hop within the cap whose address is not listed is not trusted', () => {
    const trust = capped('10.0.0.0/8', 3)
    expect(
      resolveForwarded(req({ 'x-forwarded-for': '6.6.6.6, 203.0.113.7' }, '10.0.0.1'), trust).ip,
    ).toBe('203.0.113.7')
    expect(resolveForwarded(req({ 'x-forwarded-for': '6.6.6.6' }, '11.0.0.1'), trust).ip).toBe(
      '11.0.0.1',
    )
  })

  it('matches IPv6 CIDRs, presets and IPv4-mapped peers', () => {
    const trust = capped(['fd00::/8', '10.0.0.0/8', 'loopback'], 1)!
    expect(trust('fd12:3456::9', 0)).toBe(true)
    expect(trust('fd12:3456::9', 1)).toBe(false)
    expect(trust('::1', 0)).toBe(true)
    expect(trust('2001:db8::1', 0)).toBe(false)
    const headers = { 'x-forwarded-for': 'fd00::6, 2001:db8::1' }
    expect(resolveForwarded(req(headers, 'fd00::1'), trust).ip).toBe('2001:db8::1')
    for (const mapped of ['::ffff:10.0.0.1', '::ffff:a00:1', '0:0:0:0:0:ffff:a00:1']) {
      expect(resolveForwarded(req(headers, mapped), trust).ip).toBe('2001:db8::1')
    }
  })

  it('an unknown socket peer trusts nothing', () => {
    const r = resolveForwarded(
      {
        headers: { host: 'h.example', 'x-forwarded-for': '203.0.113.7', 'x-forwarded-host': 'x' },
        socket: {},
      },
      capped('0.0.0.0/0', 1),
    )
    expect(r).toEqual({ ip: '', protocol: 'http', host: 'h.example' })
  })

  it('rejects an invalid hops or empty addresses', () => {
    for (const hops of [0, -1, 1.5, Number.NaN, '1' as never, undefined as never]) {
      expect(() => capped('10.0.0.0/8', hops)).toThrow(/'hops' must be an integer >= 1/u)
    }
    for (const addresses of [[], '', ' , ', [''], undefined as never]) {
      expect(() => capped(addresses, 1)).toThrow(/'addresses' must list at least one/u)
    }
    expect(() => capped(['10.0.0.0/33'], 1)).toThrow(TypeError)
    expect(() => capped('10.0.0.0/8, not-an-ip', 1)).toThrow(TypeError)
  })

  it('leaves the other forms unchanged', () => {
    expect(compileTrustProxy([])).toBeUndefined()
    expect(compileTrustProxy(0)).toBeUndefined()
    const list = compileTrustProxy(['10.0.0.0/8'])!
    expect(list('10.1.1.1', 7)).toBe(true)
    const hops = compileTrustProxy(2)!
    expect([hops('6.6.6.6', 1), hops('6.6.6.6', 2)]).toEqual([true, false])
    // a hop count alone still trusts what sits in front of an unknown peer
    expect(resolveForwarded({ headers: { 'x-forwarded-for': '203.0.113.7' } }, hops).ip).toBe(
      '203.0.113.7',
    )
  })
})

function req(headers: Record<string, string>, remoteAddress = '10.0.0.1', encrypted = false) {
  return { headers, socket: { remoteAddress, encrypted } }
}

describe('resolveForwarded — parsing', () => {
  const one = compileTrustProxy(1)
  const all = compileTrustProxy(() => true)

  it('strips ports and brackets from X-Forwarded-For entries', () => {
    expect(resolveForwarded(req({ 'x-forwarded-for': '1.2.3.4:5678' }), one).ip).toBe('1.2.3.4')
    expect(resolveForwarded(req({ 'x-forwarded-for': '[2001:db8::1]:80' }), one).ip).toBe(
      '2001:db8::1',
    )
    expect(resolveForwarded(req({ 'x-forwarded-for': '2001:db8::1' }), one).ip).toBe('2001:db8::1')
  })

  it('Forwarded: quoted values, case-insensitive names, escapes, commas inside quotes', () => {
    const r = resolveForwarded(
      req({
        forwarded:
          'For="[::1]";Proto=HTTPS;Host="a.example:1", for=203.0.113.9;host="b\\".example"',
      }),
      one,
      'forwarded',
    )
    // the right-most element is the nearest proxy's; its malformed host is ignored
    expect(r).toEqual({ ip: '203.0.113.9', protocol: 'http', host: '' })
    const all2 = resolveForwarded(
      req({ forwarded: 'for="1.2.3.4";proto=https;host="x.example", for=unknown' }),
      all,
      'forwarded',
    )
    expect(all2).toEqual({ ip: '1.2.3.4', protocol: 'https', host: 'x.example' })
  })

  it('obfuscated identifiers are returned as they are (and are never trusted by a list)', () => {
    const list = compileTrustProxy(['10.0.0.0/8'])
    expect(resolveForwarded(req({ forwarded: 'for=_hidden' }), list, 'forwarded').ip).toBe(
      '_hidden',
    )
  })

  it('an element without for= gives an unknown client (never the proxy that wrote it)', () => {
    expect(resolveForwarded(req({ forwarded: 'proto=https' }), one, 'forwarded')).toEqual({
      ip: '',
      protocol: 'https',
      host: '',
    })
  })

  it('X-Forwarded-Proto/-Host: the nearest proxy’s (right-most) value; junk ignored', () => {
    expect(
      resolveForwarded(
        req({ 'x-forwarded-proto': 'https, http', 'x-forwarded-host': 'a.example, b.example' }),
        one,
      ),
    ).toMatchObject({ protocol: 'http', host: 'b.example' })
    expect(
      resolveForwarded(
        req({ host: 'h.example', 'x-forwarded-proto': 'gopher', 'x-forwarded-host': 'bad host' }),
        one,
      ),
    ).toMatchObject({ protocol: 'http', host: 'h.example' })
  })

  it('an encrypted socket is https without trust', () => {
    expect(resolveForwarded(req({}, '1.2.3.4', true), undefined).protocol).toBe('https')
  })

  it('address lists match IPv4-mapped IPv6 peers and zone ids', () => {
    const list = compileTrustProxy(['10.0.0.0/8', 'linklocal'])!
    expect(list('::ffff:10.1.2.3', 0)).toBe(true)
    expect(list('fe80::1%eth0', 0)).toBe(true)
    expect(list('11.0.0.1', 0)).toBe(false)
    expect(list('garbage', 0)).toBe(false)
  })

  it('a comma string works as a list', () => {
    const list = compileTrustProxy('loopback, 10.0.0.0/8')!
    expect(list('127.0.0.1', 0)).toBe(true)
    expect(list('10.9.9.9', 3)).toBe(true)
  })
})
