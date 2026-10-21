import { IncomingMessage, ServerResponse } from 'http'
import { Socket } from 'net'
import { describe, expect, it } from 'vitest'

import { HttpResponse } from '../../response/http-response'
import { renderCacheControl } from '../cache-control'
import { renderCookie } from '../set-cookie'

/*
 * Unit contract for every duration the HTTP API renders as seconds
 * (`Cache-Control: max-age` / `s-maxage`, cookie `Max-Age`, `Age`):
 *   - a NUMBER is seconds; a STRING is a duration with units (`'90s'`, `'1h 30m'`, `'1.5h'`);
 *   - the header carries whole seconds as DIGITS ONLY (never an exponent), rounded down and
 *     clamped to [0, 2147483648] (RFC 9111 §1.2.2); a cookie `maxAge <= 0` renders `Max-Age=0`.
 * Every API is checked against the same table; the oracle is integer arithmetic, written
 * independently of the implementation.
 */

const MAX = 2_147_483_648

function response() {
  const req = new IncomingMessage(new Socket({}))
  return new HttpResponse(new ServerResponse(req), req, console as never)
}

/** Each API: input → the FULL rendered value of its seconds field. */
const apis: Record<string, (v: number | string) => string | undefined> = {
  'cache maxAge': (v) => /^max-age=(.*)$/u.exec(renderCacheControl({ maxAge: v as never }))?.[1],
  'cache sMaxage': (v) => /^s-maxage=(.*)$/u.exec(renderCacheControl({ sMaxage: v as never }))?.[1],
  'cookie maxAge': (v) =>
    /; Max-Age=([^;]*)$/u.exec(
      renderCookie('k', { value: 'v', attrs: { maxAge: v as never } }),
    )?.[1],
  'response setCookie maxAge': (v) =>
    /; Max-Age=([^;]*)$/u.exec(
      response()
        .setCookie('k', 'v', { maxAge: v as never })
        .getSetCookieStrings()[0],
    )?.[1],
  'response setAge': (v) =>
    response()
      .setAge(v as never)
      .getHeader('age') as string,
  'response setCacheControl': (v) =>
    /^max-age=(.*)$/u.exec(
      response()
        .setCacheControl({ maxAge: v as never })
        .getHeader('cache-control') as string,
    )?.[1],
}

/** Seconds per unit as [numerator, denominator] — exact integer arithmetic. */
const UNIT: Record<string, [number, number]> = {
  ms: [1, 1000],
  s: [1, 1],
  m: [60, 1],
  h: [3600, 1],
  d: [86_400, 1],
  w: [604_800, 1],
  M: [2_592_000, 1],
  Y: [31_536_000, 1],
}
const clamp = (n: number) => String(Math.min(MAX, Math.max(0, n)))
const oracle = (count: number, unit: string) => {
  const [num, den] = UNIT[unit]
  return clamp(Math.floor((count * num) / den))
}

const numberCases: Array<[number, string]> = [
  [0, '0'],
  [1, '1'],
  [59, '59'],
  [3600, '3600'],
  [86_400, '86400'],
  [31_536_000, '31536000'],
  [1.9, '1'], // whole seconds, rounded down
  [MAX, String(MAX)],
  [MAX + 5, String(MAX)], // clamped
  [1e21, String(MAX)], // never an exponent
  [1e300, String(MAX)],
  [-5, '0'],
  [-1e21, '0'],
]

describe('duration units: numbers are seconds everywhere', () => {
  for (const [api, render] of Object.entries(apis)) {
    describe(api, () => {
      it.each(numberCases)('number %d → %s', (input, expected) => {
        const out = render(input)
        expect(out).toMatch(/^\d+$/u)
        expect(out).toBe(expected)
      })

      for (const unit of Object.keys(UNIT)) {
        for (const n of [1, 2, 15, 1000, 999_999_999]) {
          const expected = oracle(n, unit)
          it(`string '${n}${unit}' → ${expected}`, () => {
            const out = render(`${n}${unit}`)
            expect(out).toMatch(/^\d+$/u)
            expect(out).toBe(expected)
          })
        }
      }

      it('multi-part, decimal and huge strings', () => {
        expect(render('1h 30m')).toBe('5400')
        expect(render('1h30m')).toBe('5400')
        expect(render('2h 13m 16s 14ms')).toBe(String(2 * 3600 + 13 * 60 + 16))
        expect(render('1.5h')).toBe('5400')
        expect(render('0.5m')).toBe('30')
        expect(render('1.1s')).toBe('1')
        expect(render('99999999999999999999Y')).toBe(String(MAX))
      })

      it('rejects a string it cannot parse instead of rendering 0', () => {
        for (const bad of ['15x', 'soon', '', '3600', '1e3s', '-5s', 's']) {
          expect(() => render(bad), bad).toThrow(TypeError)
        }
      })

      it('rejects a non-finite number', () => {
        expect(() => render(Number.NaN)).toThrow(TypeError)
        expect(() => render(Number.POSITIVE_INFINITY)).toThrow(TypeError)
      })
    })
  }
})
