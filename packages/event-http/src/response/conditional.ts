import { EHttpStatusCode } from '../utils/status-codes'

/** Validators of a representation, as {@link checkPreconditions} takes them. */
export interface TPreconditionValidators {
  etag?: string
  lastModified?: string | Date | number
  exists?: boolean
}

const MONTHS: Record<string, number> = {
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11,
}
const DAY = '(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)'
const MON = '(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)'
const TIME = '(\\d{2}):(\\d{2}):(\\d{2})'
/** IMF-fixdate: `Sun, 06 Nov 1994 08:49:37 GMT` */
const IMF_FIXDATE_RE = new RegExp(`^${DAY}, (\\d{2}) ${MON} (\\d{4}) ${TIME} GMT$`)
/** obsolete RFC 850: `Sunday, 06-Nov-94 08:49:37 GMT` */
const RFC850_RE = new RegExp(
  `^(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), (\\d{2})-${MON}-(\\d{2}) ${TIME} GMT$`,
)
/** obsolete asctime: `Sun Nov  6 08:49:37 1994` */
const ASCTIME_RE = new RegExp(`^${DAY} ${MON} ([ \\d]\\d) ${TIME} (\\d{4})$`)

/**
 * Parses an HTTP-date (RFC 9110 §5.6.7: IMF-fixdate, or the obsolete RFC 850 / asctime forms)
 * to epoch ms. Anything else — another format, several values, an impossible date — is
 * `undefined`.
 */
export function parseHttpDate(value: string | string[] | undefined): number | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  let day: number
  let month: number
  let year: number
  let hh: number
  let mm: number
  let ss: number
  let m = IMF_FIXDATE_RE.exec(value)
  if (m) {
    day = Number(m[1])
    month = MONTHS[m[2]]
    year = Number(m[3])
    hh = Number(m[4])
    mm = Number(m[5])
    ss = Number(m[6])
  } else if ((m = RFC850_RE.exec(value))) {
    // two-digit year: the most recent year with those digits that is not > 50 years ahead
    const yy = Number(m[3])
    const now = new Date().getUTCFullYear()
    year = 2000 + yy > now + 50 ? 1900 + yy : 2000 + yy
    day = Number(m[1])
    month = MONTHS[m[2]]
    hh = Number(m[4])
    mm = Number(m[5])
    ss = Number(m[6])
  } else if ((m = ASCTIME_RE.exec(value))) {
    month = MONTHS[m[1]]
    // `Number(' 6')` is 6: the space-padded day needs no trimming
    day = Number(m[2])
    hh = Number(m[3])
    mm = Number(m[4])
    ss = Number(m[5])
    year = Number(m[6])
  } else {
    return undefined
  }
  // setUTCFullYear, not Date.UTC: Date.UTC maps years 0–99 to 1900–1999
  const d = new Date(0)
  d.setUTCFullYear(year, month, day)
  d.setUTCHours(hh, mm, ss, 0)
  const ms = d.getTime()
  // reject rollovers (32 Oct, 24:00:00, 29 Feb in a non-leap year)
  if (
    d.getUTCDate() !== day ||
    d.getUTCMonth() !== month ||
    d.getUTCHours() !== hh ||
    mm > 59 ||
    ss > 59
  ) {
    return undefined
  }
  return ms
}

/**
 * Evaluates the request's preconditions (RFC 9110 §13.2.2) against a representation with these
 * validators, BEFORE the method is performed, in the RFC's order:
 * 1. `If-Match` — strong comparison (a weak tag never matches; `*` = a current representation
 *    exists): no match → `412`;
 * 2. else `If-Unmodified-Since` — one valid HTTP-date; `lastModified` later than it → `412`
 *    (ignored without `lastModified`);
 * 3. `If-None-Match` — weak comparison, lists, `*` (= a current representation exists): a match
 *    → `304` for GET/HEAD, `412` for any other method (do not perform it);
 * 4. else, GET/HEAD only, `If-Modified-Since` — one valid HTTP-date, not in the future, and
 *    `lastModified` not later (whole seconds) → `304`.
 * Returns `undefined` when the request may proceed. `lastModified` is an HTTP-date, a `Date` or
 * a ms timestamp. `exists` says whether a current representation exists (for `*`); default:
 * it has an `etag` or a `lastModified` — pass `exists: false` when the target has nothing yet
 * (a create), `true` for an existing resource without validators.
 *
 * GET/HEAD responses get this automatically; call it yourself to answer before doing expensive
 * work, or before performing a method (PUT, DELETE…) on a stale copy (lost-update protection).
 */
export function checkPreconditions(
  method: string | undefined,
  requestHeaders: Record<string, string | string[] | undefined>,
  validators: TPreconditionValidators,
): EHttpStatusCode.NotModified | EHttpStatusCode.PreconditionFailed | undefined {
  const safe = method === 'GET' || method === 'HEAD'
  const { etag } = validators
  const exists = validators.exists ?? (etag !== undefined || validators.lastModified !== undefined)
  const lm = validators.lastModified
  const lastModified =
    typeof lm === 'string'
      ? parseHttpDate(lm)
      : lm === undefined
        ? undefined
        : Math.floor((typeof lm === 'number' ? lm : lm.getTime()) / 1000) * 1000
  const knownLm = lastModified !== undefined && Number.isFinite(lastModified)

  const im = requestHeaders['if-match']
  if (im === undefined) {
    const until = parseHttpDate(requestHeaders['if-unmodified-since'])
    if (until !== undefined && knownLm && lastModified > until) {
      return EHttpStatusCode.PreconditionFailed
    }
  } else if (typeof im !== 'string' || !ifMatchHas(im, etag, exists)) {
    return EHttpStatusCode.PreconditionFailed
  }

  const inm = requestHeaders['if-none-match']
  if (inm !== undefined) {
    const matches = typeof inm === 'string' && ifNoneMatchesCurrent(inm, etag, exists)
    return matches
      ? safe
        ? EHttpStatusCode.NotModified
        : EHttpStatusCode.PreconditionFailed
      : undefined
  }
  if (!safe) {
    return undefined
  }
  const since = parseHttpDate(requestHeaders['if-modified-since'])
  // A date later than now is invalid (RFC 9110 §13.1.3)
  return knownLm && since !== undefined && since <= Date.now() && lastModified <= since
    ? EHttpStatusCode.NotModified
    : undefined
}

/** If-Match (RFC 9110 §13.1.1): `*`, or an entry STRONGLY equal to `etag` (weak tags never match). */
export function ifMatchHas(header: string, etag: string | undefined, exists: boolean): boolean {
  const strong = etag && !etag.startsWith('W/') ? etag : undefined
  for (const part of header.split(',')) {
    const tag = part.trim()
    if ((tag === '*' && exists) || (strong !== undefined && tag === strong)) {
      return true
    }
  }
  return false
}

function stripW(tag: string): string {
  return tag.startsWith('W/') ? tag.slice(2) : tag
}

/** If-None-Match (RFC 9110 §13.1.2): `*` while a representation exists, or a WEAK match of `etag`. */
export function ifNoneMatchesCurrent(
  header: string,
  etag: string | undefined,
  exists: boolean,
): boolean {
  const opaque = etag === undefined ? undefined : stripW(etag)
  for (const part of header.split(',')) {
    const tag = part.trim()
    if (tag === '*' ? exists : opaque !== undefined && tag !== '' && stripW(tag) === opaque) {
      return true
    }
  }
  return false
}

/**
 * @internal The validators a response's `ETag` / `Last-Modified` header values give (a multi-value
 * header is no validator), for a representation that exists.
 */
export function toValidators(
  etag: string | string[] | undefined,
  lastModified: string | string[] | undefined,
): TPreconditionValidators {
  return {
    etag: typeof etag === 'string' ? etag : undefined,
    lastModified: typeof lastModified === 'string' ? lastModified : undefined,
    exists: true,
  }
}

/**
 * @internal Whether `req` may carry a conditional header — an allocation-free scan of the raw
 * header names for one of 8 / 13 / 17 / 19 characters starting with `if-` (If-Match, If-Range,
 * If-None-Match, If-Modified-Since, If-Unmodified-Since), so a request without one never makes
 * Node build `req.headers`. A request without `rawHeaders` (a synthetic or in-process one) is
 * judged by its `headers`, so `true`. Caveat: an `If-*` header added to `req.headers` by code in
 * front of wooks, and absent from `rawHeaders`, is not seen.
 */
export function mayHaveConditional(req: { rawHeaders?: string[] }): boolean {
  const raw = req.rawHeaders
  if (!raw || raw.length === 0) {
    return true
  }
  /* oxlint-disable unicorn/prefer-code-point -- an ASCII scan over UTF-16 units */
  for (let i = 0; i < raw.length; i += 2) {
    const name = raw[i]
    const l = name.length
    if (
      (l === 8 || l === 13 || l === 17 || l === 19) &&
      (name.charCodeAt(0) | 32) === 105 && // i
      (name.charCodeAt(1) | 32) === 102 && // f
      name.charCodeAt(2) === 45 // -
    ) {
      return true
    }
  }
  /* oxlint-enable unicorn/prefer-code-point */
  return false
}
