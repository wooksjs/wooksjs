import { BlockList, isIP } from 'net'

import { TOKEN_RE } from './helpers'

/**
 * Which proxies to trust, app-wide (`createHttpApp({ trustProxy })`):
 *
 * - `false` (default) — trust no proxy: forwarded headers are ignored; the client is the socket peer.
 * - a number `n` — trust the first `n` hops counted from this server: the socket peer is hop 0,
 *   the right-most `X-Forwarded-For` entry hop 1, and so on. `1` = one reverse proxy in front.
 * - a list (or a comma string) — trust hops whose address is in it: IPs (`'10.0.0.5'`, `'::1'`),
 *   CIDR ranges (`'10.0.0.0/8'`, `'fd00::/8'`) and the presets `'loopback'`, `'linklocal'`,
 *   `'uniquelocal'`.
 * - a predicate `(addr, hopIndex) => boolean` — `hopIndex` 0 is the socket peer; `addr` is
 *   normalised (IPv4-mapped IPv6 as plain IPv4). A predicate that throws trusts nothing.
 *
 * When the socket peer is unknown (an in-process `fetch()` with no peer given), list and
 * predicate trust trust nothing; a hop count still trusts whatever sits in front.
 *
 * `true` is rejected (it would mean "trust everyone", which lets any client pick its own IP);
 * pass the hop count instead.
 */
export type TTrustProxy = false | number | string | string[] | TTrustProxyFn

/**
 * Decides whether hop `hopIndex` (0 = the socket peer), whose normalised address is `addr`,
 * is a trusted proxy.
 */
export type TTrustProxyFn = (addr: string, hopIndex: number) => boolean

/**
 * Which forwarding headers a trusted proxy chain uses:
 * - `'x-forwarded'` (default) — `X-Forwarded-For` / `X-Forwarded-Proto` / `X-Forwarded-Host`;
 * - `'forwarded'` — RFC 7239 `Forwarded` (`for=`, `proto=`, `host=`).
 *
 * Only ONE family is read: a client can send either header, so reading both would let it pick
 * the one its proxies don't manage.
 */
export type TProxyHeaders = 'x-forwarded' | 'forwarded'

/** The client as seen through the trusted proxy chain. */
export interface TForwardedInfo {
  /**
   * Client address: the right-most hop that is not a trusted proxy (the socket peer without
   * trust), IPv4-mapped IPv6 normalised to IPv4. `''` when unknown: the peer is unknown, or a
   * trusted proxy's entry is missing or malformed. A `Forwarded` obfuscated identifier
   * (`unknown`, `_hidden`) is returned as is.
   */
  ip: string
  /** `'https'` or `'http'`, as the client used it (the socket's own without trust). */
  protocol: 'http' | 'https'
  /**
   * `Host` the client asked for, with port if any (`''` when missing or malformed). Client-chosen:
   * allowlist it before building absolute URLs from it.
   */
  host: string
}

/** The minimum of a Node request the resolver reads. */
export interface TForwardedRequest {
  headers: Record<string, string | string[] | undefined>
  socket?: { remoteAddress?: string; encrypted?: boolean } | null
}

const PRESETS: Record<string, Array<[string, number, 'ipv4' | 'ipv6']>> = {
  loopback: [
    ['127.0.0.0', 8, 'ipv4'],
    ['::1', 128, 'ipv6'],
  ],
  linklocal: [
    ['169.254.0.0', 16, 'ipv4'],
    ['fe80::', 10, 'ipv6'],
  ],
  uniquelocal: [
    ['10.0.0.0', 8, 'ipv4'],
    ['172.16.0.0', 12, 'ipv4'],
    ['192.168.0.0', 16, 'ipv4'],
    ['fc00::', 7, 'ipv6'],
  ],
}

/** Marks a compiled hop-count trust: the only kind that applies to an unknown socket peer. */
const HOP_COUNT = Symbol('wooks.trustProxy.hops')

/**
 * Compiles a {@link TTrustProxy} option into a predicate (`undefined` = trust nothing).
 * Throws a `TypeError` for an invalid option (an unparseable address or CIDR, `true`, a negative
 * or fractional count).
 */
export function compileTrustProxy(trust: TTrustProxy | undefined): TTrustProxyFn | undefined {
  if (trust === undefined || trust === false) {
    return undefined
  }
  if (typeof trust === 'function') {
    return trust
  }
  if (typeof trust === 'number') {
    if (!Number.isInteger(trust) || trust < 0) {
      throw new TypeError(`trustProxy: expected a hop count (integer >= 0), got ${trust}`)
    }
    if (trust === 0) {
      return undefined
    }
    const hops: TTrustProxyFn = (_addr, i) => i < trust
    return Object.assign(hops, { [HOP_COUNT]: true })
  }
  if (typeof trust === 'string' || Array.isArray(trust)) {
    const entries = typeof trust === 'string' ? trust.split(',') : trust
    if (entries.length === 0) {
      return undefined
    }
    const list = new BlockList()
    for (const raw of entries) {
      addTrusted(list, String(raw).trim())
    }
    return (addr) => {
      const ip = stripZone(addr)
      const family = isIP(ip)
      return family !== 0 && list.check(ip, family === 4 ? 'ipv4' : 'ipv6')
    }
  }
  const hint = trust === true ? ' (use 1 to trust one reverse proxy)' : ''
  throw new TypeError(
    `trustProxy: expected false, a hop count, a list of IPs/CIDRs or a function — got ${String(trust)}${hint}`,
  )
}

function isHopCount(trust: TTrustProxyFn): boolean {
  return (trust as { [HOP_COUNT]?: boolean })[HOP_COUNT] === true
}

function addTrusted(list: BlockList, entry: string) {
  const preset = PRESETS[entry]
  if (preset) {
    for (const [net, prefix, family] of preset) {
      list.addSubnet(net, prefix, family)
    }
    return
  }
  const slash = entry.indexOf('/')
  const ip = slash === -1 ? entry : entry.slice(0, slash)
  const family = isIP(ip)
  const max = family === 4 ? 32 : 128
  const prefixText = slash === -1 ? String(max) : entry.slice(slash + 1)
  const prefix = Number(prefixText)
  if (family === 0 || !/^\d{1,3}$/u.test(prefixText) || prefix > max) {
    throw new TypeError(
      `trustProxy: '${entry}' is not an IP address, a CIDR range or one of ${Object.keys(PRESETS).join(', ')}`,
    )
  }
  list.addSubnet(ip, prefix, family === 4 ? 'ipv4' : 'ipv6')
}

function stripZone(addr: string): string {
  const i = addr.indexOf('%')
  return i === -1 ? addr : addr.slice(0, i)
}

/**
 * One form per address: an IPv4-mapped IPv6 address — dotted (`::ffff:10.0.0.1`), hex
 * (`::ffff:a00:1`) or fully written (`0:0:0:0:0:ffff:a00:1`) — becomes plain IPv4.
 */
export function normalizeAddress(addr: string): string {
  if (!addr.includes(':')) {
    return addr
  }
  // fast path for the common dotted form (what Node reports for an IPv4 client on a dual stack)
  if (addr.startsWith('::ffff:') && isDottedIPv4(addr, 7)) {
    return addr.slice(7)
  }
  if (isIP(addr) !== 6) {
    return addr
  }
  const groups = expandV6(addr.toLowerCase())
  if (groups && groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff) {
    const [hi, lo] = [groups[6], groups[7]]
    return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`
  }
  return addr
}

/**
 * Whether `s` from `start` to its end is a dotted IPv4 address — exactly what `isIP() === 4`
 * accepts (four decimal parts 0–255, no leading zeros), without allocating.
 */
/* oxlint-disable unicorn/prefer-code-point -- an ASCII scan over UTF-16 units */
export function isDottedIPv4(s: string, start: number): boolean {
  let parts = 0
  let i = start
  while (i < s.length) {
    const partStart = i
    let value = 0
    while (i < s.length && i - partStart < 3) {
      const c = s.charCodeAt(i)
      if (c < 48 || c > 57) {
        break
      }
      value = value * 10 + (c - 48)
      i++
    }
    const len = i - partStart
    if (len === 0 || value > 255 || (len > 1 && s.charCodeAt(partStart) === 48)) {
      return false
    }
    parts++
    if (i === s.length) {
      break
    }
    if (s.charCodeAt(i) !== 46) {
      return false
    }
    i++
    if (i === s.length) {
      return false
    }
  }
  return parts === 4
}
/* oxlint-enable unicorn/prefer-code-point */

/** The 8 groups of an IPv6 address (no zone), embedded dotted IPv4 included. */
function expandV6(addr: string): number[] | undefined {
  let a = addr
  const tailV4 = /(\d{1,3}(?:\.\d{1,3}){3})$/u.exec(a)
  if (tailV4) {
    const [w, x, y, z] = tailV4[1].split('.').map(Number)
    a = `${a.slice(0, tailV4.index)}${((w << 8) | x).toString(16)}:${((y << 8) | z).toString(16)}`
  }
  const [head, tail] = a.split('::')
  const left = head ? head.split(':') : []
  const right = tail === undefined ? [] : tail ? tail.split(':') : []
  const fill = tail === undefined ? 0 : 8 - left.length - right.length
  const groups = [...left, ...Array.from({ length: fill }, () => '0'), ...right].map((g) =>
    Number.parseInt(g, 16),
  )
  return groups.length === 8 && groups.every((g) => g >= 0 && g <= 0xffff) ? groups : undefined
}

const PORT_DIGITS_RE = /^\d{1,5}$/u

function isPort(v: string): boolean {
  return PORT_DIGITS_RE.test(v) && Number(v) <= 65_535
}
const OBF_RE = /^_[\w.-]+$/u

/**
 * An `X-Forwarded-For` entry → normalised address, or `undefined` when it is not one:
 * `1.2.3.4`, `1.2.3.4:80`, `2001:db8::1`, `[2001:db8::1]`, `[2001:db8::1]:443`.
 */
function parseXffNode(raw: string): string | undefined {
  const v = raw.trim()
  if (v.startsWith('[')) {
    const end = v.indexOf(']')
    const rest = end === -1 ? '' : v.slice(end + 1)
    if (
      end === -1 ||
      isIP(v.slice(1, end)) !== 6 ||
      (rest !== '' && !(rest[0] === ':' && isPort(rest.slice(1))))
    ) {
      return undefined
    }
    return normalizeAddress(v.slice(1, end))
  }
  if (isIP(v) !== 0) {
    return normalizeAddress(v)
  }
  const colon = v.indexOf(':')
  if (
    colon > 0 &&
    colon === v.lastIndexOf(':') &&
    isIP(v.slice(0, colon)) === 4 &&
    isPort(v.slice(colon + 1))
  ) {
    return v.slice(0, colon)
  }
  return undefined
}

/**
 * A `Forwarded: for=` value (already unquoted) → node name, or `undefined` when it is not a
 * node (RFC 7239 §6): IPv4, `[IPv6]`, `unknown` or `_obfuscated`, each with an optional port —
 * plus a bare IPv6 without brackets, which some proxies write.
 */
function parseForwardedNode(value: string): string | undefined {
  if (isIP(value) === 6) {
    // lenient: a bare IPv6 (`for="2001:db8::1"`, nginx `for="$remote_addr"`) is unambiguous
    return normalizeAddress(value)
  }
  let name = value
  let port: string | undefined
  if (value.startsWith('[')) {
    const end = value.indexOf(']')
    if (end === -1) {
      return undefined
    }
    name = value.slice(1, end)
    const rest = value.slice(end + 1)
    if (rest !== '') {
      if (rest[0] !== ':') {
        return undefined
      }
      port = rest.slice(1)
    }
    if (isIP(name) !== 6) {
      return undefined
    }
  } else {
    const parts = value.split(':')
    if (parts.length > 2) {
      return undefined
    }
    name = parts[0]
    port = parts[1]
    if (isIP(name) !== 4 && name.toLowerCase() !== 'unknown' && !OBF_RE.test(name)) {
      return undefined
    }
  }
  if (port !== undefined && !isPort(port) && !OBF_RE.test(port)) {
    return undefined
  }
  return normalizeAddress(name.toLowerCase() === 'unknown' ? 'unknown' : name)
}

/* ---------------------------------------------------- RFC 7239 parsing ---- */

/** RFC 9110 tchar */
const TCHAR_RE = /^[!#$%&'*+\-.^`|~\w]$/u

/** One `Forwarded` element: what the proxy that appended it saw. `MALFORMED` when unparseable. */
interface THopElement {
  for?: string
  proto?: string
  host?: string
}
const MALFORMED = Symbol('malformed')
type TElement = THopElement | typeof MALFORMED

function isOws(c: string | undefined): boolean {
  return c === ' ' || c === '\t'
}

/** Whether the `"` at `i` is escaped (preceded by an odd run of backslashes). */
function isEscaped(s: string, i: number): boolean {
  let n = 0
  for (let j = i - 1; j >= 0 && s[j] === '\\'; j--) {
    n++
  }
  return n % 2 === 1
}

/**
 * Splits a `Forwarded` value into elements FROM THE RIGHT: the trusted proxies' elements are
 * the right-most ones and are well-formed, so their boundaries are found without reading
 * anything a client wrote further left. A quoted string is matched to its opening quote; the
 * first boundary that cannot be found (an unterminated quote) turns everything left of it into
 * one MALFORMED element. Each span is then parsed strictly, left to right.
 * Returned left-to-right; empty elements are dropped (RFC 9110 §5.6.1).
 */
function forwardedElements(value: string): TElement[] {
  const out: TElement[] = []
  let end = value.length
  let i = value.length - 1
  while (i >= 0) {
    const c = value[i]
    if (c === '"' && !isEscaped(value, i)) {
      let j = i - 1
      while (j >= 0 && !(value[j] === '"' && !isEscaped(value, j))) {
        j--
      }
      if (j < 0) {
        out.push(MALFORMED)
        end = -1
        break
      }
      i = j - 1
    } else if (c === ',') {
      pushElement(out, value.slice(i + 1, end))
      end = i
      i--
    } else {
      i--
    }
  }
  if (end >= 0) {
    pushElement(out, value.slice(0, end))
  }
  return out.toReversed()
}

function pushElement(out: TElement[], span: string) {
  const el = parseElement(span)
  if (el !== undefined) {
    out.push(el)
  }
}

/** Strict RFC 7239 §4 element: `[pair] *( ";" [pair] )`, pair = token "=" ( token / quoted-string ). */
function parseElement(s: string): TElement | undefined {
  let p = 0
  const skipOws = () => {
    while (isOws(s[p])) {
      p++
    }
  }
  skipOws()
  if (p >= s.length) {
    return undefined // empty list element
  }
  const el: THopElement = {}
  while (p < s.length) {
    if (s[p] === ';') {
      p++
      skipOws()
      continue
    }
    const nameStart = p
    while (p < s.length && TCHAR_RE.test(s[p])) {
      p++
    }
    const name = s.slice(nameStart, p).toLowerCase()
    skipOws()
    if (!name || s[p] !== '=') {
      return MALFORMED
    }
    p++
    skipOws()
    let value = ''
    if (s[p] === '"') {
      p++
      let closed = false
      while (p < s.length) {
        const c = s[p]
        if (c === '\\') {
          const next = s[p + 1]
          if (next === undefined || !isQuotedPairChar(next)) {
            return MALFORMED
          }
          value += next
          p += 2
        } else if (c === '"') {
          p++
          closed = true
          break
        } else if (isQdText(c)) {
          value += c
          p++
        } else {
          return MALFORMED
        }
      }
      if (!closed) {
        return MALFORMED
      }
    } else {
      const start = p
      while (p < s.length && s[p] !== ';' && s[p] !== '"' && !isOws(s[p])) {
        p++
      }
      const raw = s.slice(start, p)
      if (TOKEN_RE.test(raw)) {
        value = raw
      } else if ((name === 'for' || name === 'by') && parseXffNode(raw) !== undefined) {
        // Lenient: an UNQUOTED IP / IP:port / [IPv6]:port, as common proxies write it. Element
        // and pair boundaries are already fixed (`:` `[` `]` cannot move them); the value
        // must parse as an address in full, else the element is malformed.
        value = raw
      } else {
        return MALFORMED
      }
    }
    if (name === 'for' || name === 'proto' || name === 'host') {
      if (el[name] !== undefined) {
        return MALFORMED // for / proto / host MUST NOT occur twice in one element
      }
      el[name] = value
    }
    skipOws()
    if (p < s.length) {
      if (s[p] !== ';') {
        return MALFORMED
      }
      p++
      skipOws()
    }
  }
  return el
}

function isQdText(c: string): boolean {
  const code = c.codePointAt(0) ?? 0
  return (
    c === '\t' ||
    c === ' ' ||
    code === 0x21 ||
    (code >= 0x23 && code <= 0x5b) ||
    (code >= 0x5d && code <= 0x7e) ||
    (code >= 0x80 && code <= 0xff)
  )
}

function isQuotedPairChar(c: string): boolean {
  const code = c.codePointAt(0) ?? 0
  return c === '\t' || c === ' ' || (code >= 0x21 && code <= 0x7e) || (code >= 0x80 && code <= 0xff)
}

/* ---------------------------------------------------------- resolution ---- */

function splitList(value: string | string[] | undefined): string[] {
  if (value === undefined) {
    return []
  }
  const joined = Array.isArray(value) ? value.join(',') : value
  return joined === '' ? [] : joined.split(',').map((s) => s.trim())
}

/** The right-most entry of a comma list header (`''` when absent). */
function lastEntry(value: string | string[] | undefined): string {
  const list = splitList(value)
  return list.length ? list[list.length - 1] : ''
}

const HOST_RE = /^(?:[\w.-]+|\[[\da-f:.]+\])(?::\d{1,5})?$/iu

function headerValue(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? ''
}

function validHost(v: string | undefined): string | undefined {
  const h = v?.trim()
  return h && HOST_RE.test(h) ? h : undefined
}

/** Thrown inside the walk when the trust predicate throws (fail closed). */
const TRUST_FAILED = Symbol('trust failed')

/**
 * Something `resolveForwarded` had to fail closed on — worth logging, it points at a
 * misconfiguration:
 * - `trust-error` — the trust predicate threw (nothing was trusted);
 * - `malformed` — the entry written by the socket peer itself (hop 0, your own proxy) is
 *   malformed or not an address, so every client of this request resolves to `''`.
 */
export type TForwardedIssue =
  | { kind: 'trust-error'; error: unknown }
  | { kind: 'malformed'; hop: 0; header: 'forwarded' | 'x-forwarded-for'; value: string }

/**
 * Resolves the client's address, protocol and host through the trusted proxy chain.
 *
 * **Address.** Walks from this server outward: hop 0 is the socket peer, hop 1 the right-most
 * forwarded entry, and so on. The walk stops at the first hop that is not trusted
 * (`trust(addr, hopIndex)`); that hop is the client. When the entries run out first, the
 * furthest hop reached is the client (so with no forwarding header at all — or only empty
 * list elements — a trusted peer is itself the client). Entries a client sent itself sit left
 * of every trusted entry and are never reached. An entry a trusted hop wrote that is present
 * but empty, malformed or not an address makes the client unknown (`''`) — never that trusted
 * hop's own address.
 *
 * **`Forwarded` parsing** (RFC 7239) runs from the right: the trusted proxies' elements are
 * delimited without reading what the client put in front, so an unterminated quote or a stray
 * separator from the client cannot merge or split them. Structure is parsed with the strict
 * token / quoted-string grammar; a `for=` value may also be an unquoted IP / IP:port or a
 * bare IPv6, as common proxies write it.
 *
 * **Protocol and host.**
 * - `'forwarded'`: every proxy appends one element, so each trusted hop's element is read; the
 *   outermost trusted element that carries `proto=` / `host=` wins.
 * - `'x-forwarded'`: these headers are not appended per hop reliably, so only the value written
 *   by the nearest proxy is used — the right-most `X-Forwarded-Proto` / `X-Forwarded-Host`
 *   entry — and only when hop 0 is trusted.
 *
 * Otherwise the socket's protocol and the `Host` header apply. A protocol other than
 * http/https and a malformed host are ignored (a malformed `Host` header gives `''`).
 *
 * **Unknown peer.** Without a socket address, list and predicate trust trust nothing; a hop
 * count still applies. **Throwing predicate:** fails closed — nothing is trusted, the client is
 * unknown (`''`), and `onIssue` gets `{ kind: 'trust-error' }`.
 *
 * Pure: usable outside a request (e.g. in a rate limiter) with a Node `IncomingMessage`.
 *
 * @param req - The request (only `headers` and `socket.remoteAddress` / `socket.encrypted` are read).
 * @param trust - A compiled predicate ({@link compileTrustProxy}); `undefined` trusts nothing.
 * @param proxyHeaders - Which header family the trusted proxies write (default `'x-forwarded'`).
 * @param onIssue - Told about a throwing predicate or a malformed hop-0 entry ({@link TForwardedIssue}).
 */
export function resolveForwarded(
  req: TForwardedRequest,
  trust: TTrustProxyFn | undefined,
  proxyHeaders: TProxyHeaders = 'x-forwarded',
  onIssue?: (issue: TForwardedIssue) => void,
): TForwardedInfo {
  const socket = req.socket
  const headers = req.headers
  const peer = normalizeAddress(socket?.remoteAddress ?? '')
  const base: TForwardedInfo = {
    ip: peer,
    protocol: socket?.encrypted ? 'https' : 'http',
    host: validHost(headerValue(headers.host)) ?? '',
  }
  if (!trust || (peer === '' && !isHopCount(trust))) {
    return base
  }
  const trusted = (addr: string, hop: number) => {
    try {
      return trust(addr, hop)
    } catch (error) {
      onIssue?.({ kind: 'trust-error', error })
      throw TRUST_FAILED
    }
  }
  try {
    if (!trusted(peer, 0)) {
      return base
    }
    return proxyHeaders === 'forwarded'
      ? walkForwarded(base, headers.forwarded, trusted, onIssue)
      : walkXForwarded(base, headers, trusted, onIssue)
  } catch (error) {
    if (error === TRUST_FAILED) {
      return { ...base, ip: '' }
    }
    throw error
  }
}

/** Hop 0 is trusted on entry. No elements at all: the trusted peer is the client. */
function walkForwarded(
  base: TForwardedInfo,
  raw: string | string[] | undefined,
  trusted: TTrustProxyFn,
  onIssue: ((issue: TForwardedIssue) => void) | undefined,
): TForwardedInfo {
  const out = { ...base }
  const value = Array.isArray(raw) ? raw.join(', ') : (raw ?? '')
  const elements = value ? forwardedElements(value) : []
  const malformed = (hop: number) => {
    out.ip = ''
    if (hop === 0) {
      onIssue?.({ kind: 'malformed', hop: 0, header: 'forwarded', value })
    }
  }
  for (let k = elements.length - 1, hop = 0; k >= 0; k--) {
    const element = elements[k]
    if (element === MALFORMED) {
      malformed(hop)
      break
    }
    const proto = element.proto?.toLowerCase()
    if (proto === 'http' || proto === 'https') {
      out.protocol = proto
    }
    const host = validHost(element.host)
    if (host) {
      out.host = host
    }
    const node = element.for === undefined ? undefined : parseForwardedNode(element.for)
    if (node === undefined) {
      malformed(hop)
      break
    }
    out.ip = node
    if (!trusted(node, ++hop)) {
      break
    }
  }
  return out
}

/** Hop 0 is trusted on entry. No entries at all: the trusted peer is the client. */
function walkXForwarded(
  base: TForwardedInfo,
  headers: TForwardedRequest['headers'],
  trusted: TTrustProxyFn,
  onIssue: ((issue: TForwardedIssue) => void) | undefined,
): TForwardedInfo {
  const out = { ...base }
  const proto = lastEntry(headers['x-forwarded-proto']).toLowerCase()
  if (proto === 'http' || proto === 'https') {
    out.protocol = proto
  }
  const host = validHost(lastEntry(headers['x-forwarded-host']))
  if (host) {
    out.host = host
  }
  const fors = splitList(headers['x-forwarded-for'])
  for (let k = fors.length - 1, hop = 0; k >= 0; k--) {
    const node = parseXffNode(fors[k])
    if (node === undefined) {
      out.ip = ''
      if (hop === 0) {
        onIssue?.({
          kind: 'malformed',
          hop: 0,
          header: 'x-forwarded-for',
          value: headerValue(headers['x-forwarded-for']),
        })
      }
      break
    }
    out.ip = node
    if (!trusted(node, ++hop)) {
      break
    }
  }
  return out
}
