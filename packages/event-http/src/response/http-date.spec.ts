import { describe, expect, it } from 'vitest'

import { parseHttpDate } from './http-response'

/*
 * parseHttpDate: RFC 9110 §5.6.7 — IMF-fixdate, plus the obsolete RFC 850 and asctime forms.
 * Anything else, several values, or an impossible date is `undefined`. Results are checked
 * through UTC calendar fields, not by re-parsing.
 */
const fields = (ms: number | undefined) => {
  if (ms === undefined) {
    return undefined
  }
  const d = new Date(ms)
  return [
    d.getUTCFullYear(),
    d.getUTCMonth() + 1,
    d.getUTCDate(),
    d.getUTCHours(),
    d.getUTCMinutes(),
    d.getUTCSeconds(),
  ]
}

describe('parseHttpDate', () => {
  it.each([
    ['Sun, 06 Nov 1994 08:49:37 GMT', [1994, 11, 6, 8, 49, 37]],
    ['Sunday, 06-Nov-94 08:49:37 GMT', [1994, 11, 6, 8, 49, 37]],
    ['Sun Nov  6 08:49:37 1994', [1994, 11, 6, 8, 49, 37]],
    ['Thu, 29 Feb 2024 23:59:59 GMT', [2024, 2, 29, 23, 59, 59]],
    // four-digit years below 100 stay in the first century (no Date.UTC 19xx mapping)
    ['Sat, 01 Jan 0050 00:00:00 GMT', [50, 1, 1, 0, 0, 0]],
    ['Mon, 01 Jan 0001 00:00:00 GMT', [1, 1, 1, 0, 0, 0]],
    ['Thu Jan  1 00:00:00 0099', [99, 1, 1, 0, 0, 0]],
  ])('%s', (value, expected) => {
    expect(fields(parseHttpDate(value))).toEqual(expected)
  })

  it.each([
    '2026',
    '1',
    '2027-01-01T00:00:00Z',
    'Wed, 21 Oct 2026 10:00:00 PST',
    'Wed, 32 Oct 2026 10:00:00 GMT',
    'Wed, 29 Feb 2023 10:00:00 GMT',
    'Wed, 21 Oct 2026 24:00:00 GMT',
    'Wed, 21 Oct 2026 10:60:00 GMT',
    'Fri, 01 Jan 2027 00:00:00 GMT, Sat, 01 Jan 2000 00:00:00 GMT',
    'wed, 21 oct 2026 10:00:00 gmt',
    '',
  ])('rejects %j', (value) => {
    expect(parseHttpDate(value)).toBeUndefined()
  })

  it('rejects non-strings', () => {
    expect(parseHttpDate(undefined)).toBeUndefined()
    expect(parseHttpDate(['Sun, 06 Nov 1994 08:49:37 GMT'])).toBeUndefined()
  })
})
