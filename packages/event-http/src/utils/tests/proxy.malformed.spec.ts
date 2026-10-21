/**
 * Proxy trust — malformed input class (review H1, L4, L5, L6).
 *
 * Invariants:
 *  1. Elements are delimited by what the trusted proxies appended: nothing a client sends
 *     (unterminated quotes, escapes, separators) moves those boundaries.
 *  2. An element written by a trusted hop that is malformed, lacks `for=`, or carries a `for=`
 *     that is not a node (IP, `unknown`, `_obfuscated`) — or an empty / non-IP X-Forwarded-For
 *     entry reached through a trusted hop — makes the client UNKNOWN (`''`). It never resolves
 *     to a trusted hop's own address, and never to a free-form string.
 *  3. With an unknown socket peer, list and predicate trust never read forwarding headers.
 *  4. A throwing predicate fails closed: nothing is trusted, the client is unknown.
 *  5. IPv4-mapped IPv6 addresses are normalised before matching, predicates and the result.
 *  6. A malformed trust entry throws at startup.
 *  7. `Host` is validated the same way with or without trust.
 */
import { describe, expect, it, vi } from 'vitest'

import { compileTrustProxy, resolveForwarded } from '../proxy'

const PEER = '10.0.0.2'
const req = (headers: Record<string, string>, remoteAddress: string | undefined = PEER) => ({
  headers,
  socket: { remoteAddress, encrypted: false },
})
const trusts = {
  'hop count 1': compileTrustProxy(1),
  'list 10/8': compileTrustProxy(['10.0.0.0/8']),
  predicate: compileTrustProxy((addr) => addr.startsWith('10.')),
}

describe('review probes (literal)', () => {
  for (const [name, trust] of Object.entries(trusts)) {
    it(`F1 [${name}]: an unterminated quote cannot swallow the proxy's element`, () => {
      const attacker = 'for=6.6.6.6;proto=https;host=evil.example;x="'
      const appended = 'for="[2001:db8::cafe]";proto=http;host=app.example'
      expect(
        resolveForwarded(
          req({ forwarded: `${attacker}, ${appended}`, host: 'app.example' }),
          trust,
          'forwarded',
        ),
      ).toEqual({ ip: '2001:db8::cafe', protocol: 'http', host: 'app.example' })
      expect(
        resolveForwarded(req({ forwarded: 'for=6.6.6.6;x=", for="9.9.9.9"' }), trust, 'forwarded')
          .ip,
      ).toBe('9.9.9.9')
      expect(
        resolveForwarded(req({ forwarded: 'for="1.1.1.1, for=9.9.9.9' }), trust, 'forwarded').ip,
      ).toBe('9.9.9.9')
    })

    it(`F1d [${name}]: the client never resolves as the trusted proxy itself`, () => {
      expect(
        resolveForwarded(req({ forwarded: 'x=", for="[2001:db8::cafe]"' }), trust, 'forwarded').ip,
      ).toBe('2001:db8::cafe')
      expect(resolveForwarded(req({ forwarded: 'x="' }), trust, 'forwarded').ip).toBe('')
      expect(resolveForwarded(req({ forwarded: 'proto=https' }), trust, 'forwarded').ip).toBe('')
      expect(
        resolveForwarded(req({ forwarded: 'for=6.6.6.6, proto=https' }), trust, 'forwarded').ip,
      ).toBe('')
    })
  }

  it('hop count 2 over a one-proxy chain: the client-written element is malformed → unknown', () => {
    const two = compileTrustProxy(2)
    const forwarded =
      'for=6.6.6.6;proto=https;host=evil.example;x=", for="[2001:db8::cafe]";proto=http'
    expect(resolveForwarded(req({ forwarded }), two, 'forwarded')).toEqual({
      ip: '',
      protocol: 'http',
      host: '',
    })
    expect(
      resolveForwarded(req({ forwarded: 'x=", for="[2001:db8::cafe]"' }), two, 'forwarded').ip,
    ).toBe('')
  })

  it('F1e: a quoted comma inside a value is not an element boundary', () => {
    expect(
      resolveForwarded(
        req({ forwarded: 'for=9.9.9.9;host="a, for=6.6.6.6"' }),
        trusts['hop count 1'],
        'forwarded',
      ).ip,
    ).toBe('9.9.9.9')
  })

  it('empty X-Forwarded-For entry inside the trusted chain → unknown, not the proxy', () => {
    expect(
      resolveForwarded(req({ 'x-forwarded-for': '6.6.6.6,,10.0.0.9' }), trusts['list 10/8']).ip,
    ).toBe('')
  })
})

/* ------------------------------------------------------------ generated ---- */

const MALFORMED_ELEMENTS = [
  'x="', // unterminated quote
  'for="1.1.1.1', // unterminated quote around the node
  'for=', // empty value
  'for', // no "="
  '=1.1.1.1', // no name
  'for=1.1.1.1 2.2.2.2', // whitespace inside a token
  'fór=1.1.1.1', // non-ASCII name
  'for=1.1.1.1;for=2.2.2.2', // for= twice
  'for=6"6.6.6', // a quote inside a token
  'for="1.1.1.1"x', // garbage after a quoted string
  'proto=https', // no for=
  'host="a.example"', // no for=
  'for=garbage', // not a node
  'for="[1.2.3.4]"', // brackets around IPv4
  'for=1.2.3.4:99999', // port out of range
  'for=[1.2.3.4]', // brackets around IPv4
]
const BAD_XFF = ['', ' ', 'garbage', '"1.1.1.1"', '1.1.1.1 2.2.2.2', 'ü', '[::1', '::1]:80']

describe('generated: a malformed element at any trusted position → unknown client', () => {
  // Chain: client, then proxies p1..pn (all in 10/8). The element written by trusted hop `bad`
  // is replaced; every trust config trusts exactly the n proxies.
  it.each([1, 2, 3])('chain of %i proxies', (n) => {
    const proxies = Array.from({ length: n }, (_, i) => `10.0.0.${i + 1}`)
    const configs = [
      compileTrustProxy(n),
      compileTrustProxy(['10.0.0.0/8']),
      compileTrustProxy((a) => a.startsWith('10.')),
    ]
    for (const bad of MALFORMED_ELEMENTS) {
      for (let pos = 0; pos < n; pos++) {
        // elements[k] is appended by proxies[k] and names its peer (k=0: the client)
        const elements = proxies.map(
          (_, k) => `for=${k === 0 ? '203.0.113.7' : proxies[k - 1]};proto=https`,
        )
        elements[pos] = bad
        for (const prefix of ['', 'for=6.6.6.6, ', 'x=", ']) {
          const headers = { forwarded: prefix + elements.join(', ') }
          for (const trust of configs) {
            const got = resolveForwarded(req(headers, proxies[n - 1]), trust, 'forwarded')
            expect(proxies, JSON.stringify({ bad, pos, headers })).not.toContain(got.ip)
            expect(got.ip, JSON.stringify({ bad, pos, headers })).toBe('')
          }
        }
      }
    }
  })

  it.each([1, 2, 3])('X-Forwarded-For with %i proxies', (n) => {
    const proxies = Array.from({ length: n }, (_, i) => `10.0.0.${i + 1}`)
    const configs = [compileTrustProxy(n), compileTrustProxy(['10.0.0.0/8'])]
    for (const bad of BAD_XFF) {
      for (let pos = 0; pos < n; pos++) {
        const entries = proxies.map((_, k) => (k === 0 ? '203.0.113.7' : proxies[k - 1]))
        entries[pos] = bad
        const headers = { 'x-forwarded-for': ['6.6.6.6', ...entries].join(', ') }
        for (const trust of configs) {
          const got = resolveForwarded(req(headers, proxies[n - 1]), trust)
          expect(proxies).not.toContain(got.ip)
          expect(got.ip, JSON.stringify({ bad, pos, headers })).toBe('')
        }
      }
    }
  })

  it('empty pairs and empty list elements are allowed (RFC 7239 §4, RFC 9110 §5.6.1)', () => {
    const one = trusts['hop count 1']
    expect(
      resolveForwarded(req({ forwarded: 'for=9.9.9.9;;proto=https' }), one, 'forwarded'),
    ).toMatchObject({
      ip: '9.9.9.9',
      protocol: 'https',
    })
    expect(resolveForwarded(req({ forwarded: ',,, for=9.9.9.9' }), one, 'forwarded').ip).toBe(
      '9.9.9.9',
    )
  })

  it('well-formed obfuscated identifiers are kept (RFC 7239 §6)', () => {
    for (const node of ['unknown', '_hidden', '_a.b-c', '"_x:_y"']) {
      expect(
        resolveForwarded(req({ forwarded: `for=${node}` }), trusts['hop count 1'], 'forwarded').ip,
      ).toBe(node.replaceAll('"', '').replace(/:_y$/u, ''))
    }
  })
})

describe('lenient forms common proxies emit (structure stays strict)', () => {
  const one = trusts['hop count 1']
  it.each([
    ['for=192.0.2.43:4711', '192.0.2.43'],
    ['for=2001:db8::1', '2001:db8::1'], // nginx `for=$remote_addr` with an IPv6 client
    ['for="2001:db8::1"', '2001:db8::1'], // nginx `for="$remote_addr"`
    ['for=[2001:db8::1]', '2001:db8::1'],
    ['for=[2001:db8::1]:4711', '2001:db8::1'],
    ['For="[2001:db8::1]:4711"', '2001:db8::1'],
    ['for = 192.0.2.43', '192.0.2.43'],
    ['for=192.0.2.43 ; proto=https', '192.0.2.43'],
    ['for=192.0.2.43;by=10.0.0.2;by=10.0.0.3', '192.0.2.43'], // repeated by= is ignored
    ['for="[::ffff:10.0.0.9]"', '10.0.0.9'],
  ])('%s → %s', (forwarded, ip) => {
    expect(resolveForwarded(req({ forwarded }), one, 'forwarded').ip).toBe(ip)
  })
})

describe('no forwarding entries: the trusted peer is the client', () => {
  it.each([
    ['X-Forwarded-For absent', {}, 'x-forwarded'],
    ['Forwarded absent', {}, 'forwarded'],
    ['Forwarded with empty elements only', { forwarded: ', ,' }, 'forwarded'],
    ['X-Forwarded-For empty', { 'x-forwarded-for': '' }, 'x-forwarded'],
  ] as const)('%s', (_label, headers, family) => {
    expect(resolveForwarded(req(headers), trusts['list 10/8'], family).ip).toBe(PEER)
  })

  it('…but a present, malformed entry makes the client unknown', () => {
    expect(resolveForwarded(req({ forwarded: 'x="' }), trusts['list 10/8'], 'forwarded').ip).toBe(
      '',
    )
    expect(resolveForwarded(req({ 'x-forwarded-for': ' , ' }), trusts['list 10/8']).ip).toBe('')
  })
})

describe('diagnostics', () => {
  it('a malformed entry written by the socket peer itself (hop 0) is reported', () => {
    const issues: unknown[] = []
    resolveForwarded(
      req({ forwarded: 'for=6.6.6.6, for=garbage' }),
      trusts['hop count 1'],
      'forwarded',
      (i) => issues.push(i),
    )
    resolveForwarded(
      req({ 'x-forwarded-for': '6.6.6.6, nope' }),
      trusts['hop count 1'],
      'x-forwarded',
      (i) => issues.push(i),
    )
    expect(issues).toEqual([
      expect.objectContaining({ kind: 'malformed', hop: 0 }),
      expect.objectContaining({ kind: 'malformed', hop: 0 }),
    ])
  })

  it('a malformed entry further out (client territory) is not reported', () => {
    const issues: unknown[] = []
    resolveForwarded(
      req({ forwarded: 'x=", for=9.9.9.9' }),
      trusts['hop count 1'],
      'forwarded',
      (i) => issues.push(i),
    )
    expect(issues).toEqual([])
  })
})

describe('unknown socket peer', () => {
  const forged = {
    'x-forwarded-for': '6.6.6.6',
    'x-forwarded-proto': 'https',
    'x-forwarded-host': 'evil.example',
  }
  for (const [name, trust] of Object.entries({
    loopback: compileTrustProxy('loopback'),
    'list 127.0.0.1': compileTrustProxy(['127.0.0.1']),
    'predicate (always true)': compileTrustProxy(() => true),
  })) {
    it(`${name}: forwarding headers are never read`, () => {
      expect(
        resolveForwarded({ headers: { ...forged, host: 'h.example' }, socket: {} }, trust),
      ).toEqual({
        ip: '',
        protocol: 'http',
        host: 'h.example',
      })
    })
  }

  it('hop count trusts whatever is in front (documented)', () => {
    expect(resolveForwarded({ headers: forged, socket: {} }, compileTrustProxy(1)).ip).toBe(
      '6.6.6.6',
    )
  })
})

describe('predicates', () => {
  it('get IPv4-mapped addresses in plain IPv4 form (dotted or hex), socket and forwarded alike', () => {
    const seen: string[] = []
    resolveForwarded(
      req({ 'x-forwarded-for': '203.0.113.7, ::ffff:a00:5' }, '0:0:0:0:0:FFFF:10.0.0.9'),
      (addr) => {
        seen.push(addr)
        return addr.startsWith('10.')
      },
    )
    expect(seen).toEqual(['10.0.0.9', '10.0.0.5', '203.0.113.7'])
  })

  it('the result is normalised too', () => {
    expect(resolveForwarded(req({}, '::ffff:127.0.0.1'), undefined).ip).toBe('127.0.0.1')
    expect(resolveForwarded(req({}, '::ffff:7f00:1'), undefined).ip).toBe('127.0.0.1')
    expect(
      resolveForwarded(req({ 'x-forwarded-for': '::ffff:cb00:7107' }), trusts['hop count 1']).ip,
    ).toBe('203.0.113.7')
  })

  it('hex-mapped peers match IPv4 lists', () => {
    expect(
      resolveForwarded(req({ 'x-forwarded-for': '6.6.6.6' }, '::ffff:a00:2'), trusts['list 10/8'])
        .ip,
    ).toBe('6.6.6.6')
  })

  it('a throwing predicate fails closed (unknown client) and reports the error', () => {
    const onIssue = vi.fn()
    const got = resolveForwarded(
      req({ 'x-forwarded-for': '6.6.6.6', 'x-forwarded-proto': 'https' }),
      () => {
        throw new Error('boom')
      },
      'x-forwarded',
      onIssue,
    )
    expect(got).toEqual({ ip: '', protocol: 'http', host: '' })
    expect(onIssue).toHaveBeenCalledOnce()
    expect(onIssue.mock.calls[0][0]).toMatchObject({ kind: 'trust-error' })
  })
})

describe('trust entries', () => {
  it('malformed CIDR prefixes throw at startup (generated)', () => {
    // (whole entries are trimmed, so a trailing space after the prefix is allowed)
    const prefixes = ['', ' 8', '0x8', '8.0', '+8', '-1', '1e1', '33', '0129', '8/8', 'eight']
    for (const p of prefixes) {
      expect(() => compileTrustProxy([`10.0.0.0/${p}`]), p).toThrow(TypeError)
    }
    for (const p of ['129', '0x10', '64.5']) {
      expect(() => compileTrustProxy([`fd00::/${p}`]), p).toThrow(TypeError)
    }
    expect(() =>
      compileTrustProxy(['10.0.0.0/8', '10.0.0.0/32', 'fd00::/128', '::/0']),
    ).not.toThrow()
  })

  it('an empty list trusts nothing', () => {
    expect(compileTrustProxy([])).toBeUndefined()
  })
})

describe('Host validation', () => {
  it('is applied with and without trust', () => {
    for (const trust of [undefined, compileTrustProxy(1)]) {
      expect(resolveForwarded(req({ host: 'evil.com/<x>' }), trust).host).toBe('')
      expect(resolveForwarded(req({ host: 'ok.example:8080' }), trust).host).toBe('ok.example:8080')
    }
  })
})
