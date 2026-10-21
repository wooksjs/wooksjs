/**
 * `normalizeAddress` has an allocation-free fast path for `::ffff:<dotted IPv4>`; its results
 * must equal the general path's for every input. The oracle here is the general path alone
 * (`isIP` + group expansion), written out independently; `isDottedIPv4` must equal
 * `isIP(s) === 4` exactly.
 */
import { isIP } from 'net'
import { describe, expect, it } from 'vitest'

import { isDottedIPv4, normalizeAddress } from '../proxy'

/** The general path only: IPv4-mapped IPv6 (any spelling) → dotted IPv4. */
function reference(addr: string): string {
  if (!addr.includes(':') || isIP(addr) !== 6) {
    return addr
  }
  let a = addr.toLowerCase()
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
  if (groups.length === 8 && groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff) {
    return `${groups[6] >> 8}.${groups[6] & 255}.${groups[7] >> 8}.${groups[7] & 255}`
  }
  return addr
}

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

const PARTS = [
  '0',
  '1',
  '9',
  '10',
  '01',
  '00',
  '099',
  '255',
  '256',
  '199',
  '249',
  '250',
  '300',
  '999',
  '1000',
  '',
  'a',
  '-1',
  ' 1',
  '1 ',
  '+1',
  '0x1',
  '１',
]
const SEPS = ['.', '.', '.', '.', '..', ':', ',', '']
const PREFIXES = [
  '',
  '::ffff:',
  '::FFFF:',
  '::ffff:0:',
  '0:0:0:0:0:ffff:',
  '::',
  '::1:',
  'fe80::',
  '::ffff',
]
const SUFFIXES = ['', '', '', '%eth0', '.', ':80', ' ']

function generate(count: number): string[] {
  const rand = mulberry32(7)
  const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)]
  const out = new Set<string>([
    '::ffff:127.0.0.1',
    '::ffff:10.0.0.5',
    '::ffff:a00:5',
    '::ffff:0.0.0.0',
    '::ffff:255.255.255.255',
    '::ffff:1.2.3',
    '::ffff:1.2.3.4.5',
    '::ffff:1.2.3.',
    '::ffff:',
    '::ffff:01.2.3.4',
    '::ffff:1.2.3.04',
    '::ffff:256.1.1.1',
    '127.0.0.1',
    '::1',
    '',
  ])
  while (out.size < count) {
    const n = 1 + Math.floor(rand() * 5)
    let dotted = pick(PARTS)
    for (let i = 1; i < n; i++) {
      dotted += pick(SEPS) + pick(PARTS)
    }
    out.add(pick(PREFIXES) + dotted + pick(SUFFIXES))
  }
  return [...out]
}

const inputs = generate(20_000)

describe('normalizeAddress fast path', () => {
  it('equals the general path for every input', () => {
    const mismatches = inputs.filter((a) => normalizeAddress(a) !== reference(a))
    expect(mismatches).toEqual([])
  })

  it('isDottedIPv4 equals isIP() === 4', () => {
    const tails = inputs.map((a) => (a.startsWith('::ffff:') ? a.slice(7) : a))
    const mismatches = tails.filter((t) => isDottedIPv4(t, 0) !== (isIP(t) === 4))
    expect(mismatches).toEqual([])
    // and from an offset
    expect(inputs.filter((a) => isDottedIPv4(`xx${a}`, 2) !== (isIP(a) === 4))).toEqual([])
  })
})
