/**
 * Property test for proxy trust (`resolveForwarded` + `compileTrustProxy`).
 *
 * Each case is a physical path: a client connects to an edge proxy, through 0..3 inner proxies,
 * to the app. Every proxy appends what it saw, as real proxies do (RFC 7239 §5 / the de-facto
 * X-Forwarded-* rules): its peer's address, the protocol and host of the request it received.
 * The client forges whatever it likes on top: extra X-Forwarded-For entries (including addresses
 * of trusted proxies), X-Forwarded-Proto/-Host, `Forwarded` elements, the header family the app
 * does not read.
 *
 * The ORACLE is the ground truth of the generated path — the client's real address, the
 * protocol it really used and the host it really asked for — never the resolver's own logic.
 * With a trust config that names exactly the real proxies (by hop count, by address list or by
 * predicate), the resolver must return the truth whatever the client forged.
 */
import { describe, expect, it } from 'vitest'

import { compileTrustProxy, resolveForwarded } from '../proxy'
import type { TProxyHeaders, TTrustProxy } from '../proxy'

// -------------------------------------------------------------- random ---

/* oxlint-disable unicorn/prefer-math-trunc -- `>>> 0` is the uint32 cast the PRNG needs */
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
}
/* oxlint-enable unicorn/prefer-math-trunc */

// -------------------------------------------------------------- pools ---

/** Addresses real proxies have (inside the trusted ranges below). */
const PROXY_V4 = ['10.0.0.1', '10.1.2.3', '10.255.0.9', '172.16.5.4', '127.0.0.1']
const PROXY_V6 = ['fd00::1', 'fd12:3456::9', '::1']
const TRUSTED_RANGES = ['10.0.0.0/8', '172.16.0.0/12', 'loopback', 'fd00::/8']
/** Client addresses (outside every trusted range). */
const CLIENT_V4 = ['203.0.113.7', '198.51.100.23', '8.8.4.4', '1.2.3.4']
const CLIENT_V6 = ['2001:db8::1', '2001:db8:cafe::17', '2a00:1450::200e']
/** What a forging client puts in headers — including trusted-looking addresses. */
const FORGED_FOR = [
  '6.6.6.6',
  '10.0.0.1',
  '127.0.0.1',
  'fd00::1',
  '::1',
  'unknown',
  'garbage',
  '1.1.1.1:80',
]
/**
 * Raw syntax a client can put in front of what the proxies append: unterminated quotes,
 * stray escapes and separators, empty pairs, non-ASCII. None of it may move the boundaries
 * of the elements the trusted proxies append.
 */
const FORGED_RAW = [
  'x="',
  'for="1.1.1.1',
  '"',
  '\\"',
  ';;',
  ',,',
  '=',
  'for=',
  'für=ü',
  'for=6.6.6.6;proto=https;host=evil.example;x="',
  'for="[fd00::1]',
  'for=6.6.6.6;host="a, for=10.0.0.1"',
  'x=\\',
]
const FORGED_PROTO = ['https', 'http', 'gopher', 'HTTPS']
const FORGED_HOST = ['evil.example', 'admin.internal:8443', 'bad host', '[::1]:99']
const HOSTS = ['app.example.com', 'shop.example:8443', 'localhost:3000', '[2001:db8::5]:443']

const pick = <T>(r: () => number, list: readonly T[]): T => list[Math.floor(r() * list.length)]

/** Ways a proxy writes its peer into X-Forwarded-For. */
function xffForm(r: () => number, addr: string): string {
  if (r() < 0.25) {
    return addr.includes(':')
      ? `[${addr}]:${1024 + Math.floor(r() * 6e4)}`
      : `${addr}:${1024 + Math.floor(r() * 6e4)}`
  }
  return addr
}

/**
 * Ways a proxy writes a node into `Forwarded: for=` — RFC forms, plus the unquoted IP / IP:port
 * forms common proxies emit (`for=$remote_addr` gives a bare IPv6).
 */
function forwardedNode(r: () => number, addr: string): string {
  const port = () => 1024 + Math.floor(r() * 6e4)
  const x = r()
  if (addr.includes(':')) {
    if (x < 0.35) {
      return `"[${addr}]"`
    }
    if (x < 0.6) {
      return `"[${addr}]:${port()}"`
    }
    if (x < 0.8) {
      return addr // unquoted bare IPv6
    }
    return `[${addr}]:${port()}` // unquoted bracketed with port
  }
  if (x < 0.3) {
    return `"${addr}:${port()}"`
  }
  if (x < 0.5) {
    return `${addr}:${port()}` // unquoted IPv4:port
  }
  return addr
}

// ------------------------------------------------------------- scenario ---

interface Scenario {
  headers: Record<string, string>
  socket: { remoteAddress: string; encrypted: boolean }
  family: TProxyHeaders
  trust: TTrustProxy
  truth: { ip: string; protocol: 'http' | 'https'; host: string }
  proxies: string[]
  describe: string
}

function scenario(r: () => number): Scenario {
  const family: TProxyHeaders = r() < 0.5 ? 'x-forwarded' : 'forwarded'
  const client = r() < 0.6 ? pick(r, CLIENT_V4) : pick(r, CLIENT_V6)
  const clientProto: 'http' | 'https' = r() < 0.7 ? 'https' : 'http'
  const host = pick(r, HOSTS)
  const proxyCount = Math.floor(r() * 4) // 0..3 proxies (0 = direct connection)
  const proxies = Array.from({ length: proxyCount }, () =>
    r() < 0.7 ? pick(r, PROXY_V4) : pick(r, PROXY_V6),
  )

  // --- what the client sends (forged) ---
  const xff: string[] = []
  const xfp: string[] = []
  const xfh: string[] = []
  const fwd: string[] = []
  const forge = Math.floor(r() * 4)
  for (let i = 0; i < forge; i++) {
    xff.push(r() < 0.3 ? pick(r, FORGED_RAW) : pick(r, FORGED_FOR))
    fwd.push(
      r() < 0.4
        ? pick(r, FORGED_RAW)
        : `for=${pick(r, FORGED_FOR)};proto=${pick(r, FORGED_PROTO)};host="${pick(r, FORGED_HOST)}"`,
    )
  }
  if (r() < 0.5) {
    xfp.push(pick(r, FORGED_PROTO))
  }
  if (r() < 0.5) {
    xfh.push(pick(r, FORGED_HOST))
  }

  // some proxies quote every value they write (IPv6 is always quoted, as RFC 7239 requires)
  const quoteAll = r() < 0.4
  // --- each proxy, edge first, appends what it saw ---
  let peer = client
  let receivedProto: 'http' | 'https' = clientProto
  let receivedHost = host
  for (const [i, proxy] of proxies.entries()) {
    const edge = i === 0
    if (family === 'x-forwarded') {
      xff.push(xffForm(r, peer))
      if (edge) {
        // the edge proxy manages X-Forwarded-Proto/-Host: overwrites, or appends to forged ones
        if (r() < 0.5) {
          xfp.length = 0
          xfh.length = 0
        }
        xfp.push(receivedProto)
        xfh.push(receivedHost)
      }
      // inner proxies pass X-Forwarded-Proto/-Host through (they only append X-Forwarded-For)
    } else {
      const node = forwardedNode(r, peer)
      const parts = [`for=${quoteAll && !node.startsWith('"') ? `"${node}"` : node}`]
      // the edge always reports proto/host; inner proxies may omit them
      if (edge || r() < 0.5) {
        parts.push(
          `proto=${quoteAll ? `"${receivedProto}"` : receivedProto}`,
          `host="${receivedHost}"`,
        )
      }
      if (r() < 0.3) {
        parts.push(`by=${forwardedNode(r, proxy)}`)
      }
      fwd.push(
        (r() < 0.2 ? parts.map((p) => p.replace(/^(\w+)=/u, (m) => m.toUpperCase())) : parts).join(
          ';',
        ),
      )
    }
    // hops behind the edge run plain http inside the network
    peer = proxy
    receivedProto = 'http'
    receivedHost = `${proxy.includes(':') ? `[${proxy}]` : proxy}:8080`
  }

  const headers: Record<string, string> = { host: proxyCount ? receivedHost : host }
  // the family the app does NOT read carries forged values only (proxies don't manage it)
  if (family === 'x-forwarded') {
    if (xff.length) {
      headers['x-forwarded-for'] = xff.join(r() < 0.5 ? ', ' : ',')
    }
    if (xfp.length) {
      headers['x-forwarded-proto'] = xfp.join(', ')
    }
    if (xfh.length) {
      headers['x-forwarded-host'] = xfh.join(', ')
    }
    if (r() < 0.5) {
      headers.forwarded = `for=6.6.6.6;proto=https;host=evil.example`
    }
  } else {
    if (fwd.length) {
      headers.forwarded = fwd.join(r() < 0.5 ? ', ' : ',')
    }
    if (r() < 0.5) {
      headers['x-forwarded-for'] = '6.6.6.6'
      headers['x-forwarded-proto'] = 'https'
      headers['x-forwarded-host'] = 'evil.example'
    }
  }

  // --- a trust config naming exactly the real proxies ---
  const proxySet = new Set(proxies)
  const mode = Math.floor(r() * 3)
  const trust: TTrustProxy =
    mode === 0 ? proxyCount : mode === 1 ? TRUSTED_RANGES : (addr: string) => proxySet.has(addr)

  // dual-stack servers see IPv4 peers in IPv4-mapped form (dotted, or hex in some stacks)
  const socketAddr =
    !peer.includes(':') && r() < 0.3
      ? r() < 0.5
        ? `::ffff:${peer}`
        : `::ffff:${hexMapped(peer)}`
      : peer
  return {
    headers,
    socket: { remoteAddress: socketAddr, encrypted: proxyCount === 0 && clientProto === 'https' },
    family,
    trust,
    truth: { ip: client, protocol: clientProto, host },
    proxies,
    describe: JSON.stringify({ family, mode, proxies, client, headers }),
  }
}

/** Test-side oracle for IPv4-mapped forms (independent of the implementation). */
function unmap(mapped: string): string {
  const tail = mapped.slice('::ffff:'.length)
  if (tail.includes('.')) {
    return tail
  }
  const [hi, lo] = tail.split(':').map((h) => Number.parseInt(h, 16))
  return [hi >> 8, hi & 255, lo >> 8, lo & 255].join('.')
}

function hexMapped(v4: string): string {
  const [a, b, c, d] = v4.split('.').map(Number)
  return `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`
}

// ---------------------------------------------------------------- tests ---

describe('proxy trust — generated proxy chains (oracle: ground truth of the path)', () => {
  it('returns the real client, protocol and host whatever the client forged (5000 paths)', () => {
    const r = mulberry32(0x5eed_0001)
    for (let n = 0; n < 5000; n++) {
      const s = scenario(r)
      const got = resolveForwarded(
        { headers: s.headers, socket: s.socket },
        compileTrustProxy(s.trust),
        s.family,
      )
      if (s.proxies.length > 0 && s.proxies.includes(got.ip)) {
        throw new Error(`case ${n}: resolved to a proxy's own address ${got.ip}\n${s.describe}`)
      }
      if (got.ip !== s.truth.ip || got.protocol !== s.truth.protocol || got.host !== s.truth.host) {
        throw new Error(
          `case ${n}: got ${JSON.stringify(got)}, truth ${JSON.stringify(s.truth)}\n${s.describe}`,
        )
      }
    }
  })

  it('without trust, forwarding headers never change anything (5000 paths)', () => {
    const r = mulberry32(0x5eed_0002)
    for (let n = 0; n < 5000; n++) {
      const s = scenario(r)
      for (const trust of [undefined, false, 0] as const) {
        const got = resolveForwarded(
          { headers: s.headers, socket: s.socket },
          compileTrustProxy(trust),
          s.family,
        )
        expect(got).toEqual({
          ip: s.socket.remoteAddress.startsWith('::ffff:')
            ? unmap(s.socket.remoteAddress)
            : s.socket.remoteAddress,
          protocol: s.socket.encrypted ? 'https' : 'http',
          host: s.headers.host,
        })
      }
    }
  })

  it('trusting too few hops stops at a real proxy, never at a forged entry (5000 paths)', () => {
    const r = mulberry32(0x5eed_0003)
    let checked = 0
    for (let n = 0; n < 5000; n++) {
      const s = scenario(r)
      if (s.proxies.length === 0) {
        continue
      }
      const got = resolveForwarded(
        { headers: s.headers, socket: s.socket },
        compileTrustProxy(s.proxies.length - 1),
        s.family,
      )
      expect(s.proxies).toContain(got.ip)
      checked++
    }
    expect(checked).toBeGreaterThan(1000)
  })
})
