import { defineWook } from '@wooksjs/event-core'
import type { EventContext } from '@wooksjs/event-core'

import { httpKind } from '../http-kind'

interface TLanguageRange {
  /** lower-cased tag or `*` */
  tag: string
  /** the tag as the client wrote it */
  raw: string
  q: number
}

const Q_RE = /^q=(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/iu

/** Parses `Accept-Language` into ranges ordered by q (desc), then header order. Malformed entries are skipped. */
function parseAcceptLanguage(header: string | undefined): TLanguageRange[] {
  if (!header) {
    return []
  }
  const ranges: Array<TLanguageRange & { i: number }> = []
  const parts = header.split(',')
  for (let i = 0; i < parts.length; i++) {
    const [rawTag, ...params] = parts[i].split(';')
    const raw = rawTag.trim()
    const tag = raw.toLowerCase()
    if (!tag || !/^(?:\*|[a-z]{1,8}(?:-[\da-z]{1,8})*)$/u.test(tag)) {
      continue
    }
    let q = 1
    let valid = true
    for (const param of params) {
      const p = param.trim()
      if (/^q=/iu.test(p)) {
        valid = Q_RE.test(p)
        q = Number(p.slice(2))
      }
    }
    if (valid) {
      ranges.push({ tag, raw, q, i })
    }
  }
  return ranges.toSorted((a, b) => b.q - a.q || a.i - b.i)
}

/** Whether range `r` (lower-case, not `*`) covers tag `t` (lower-case): `en` covers `en` and `en-US`. */
function rangeCovers(r: string, t: string): boolean {
  return t === r || t.startsWith(`${r}-`)
}

/**
 * Picks the best of `available` for `ranges`: RFC 4647 lookup (truncation) combined with basic
 * filtering (a range also covers the more specific tags under it) — see `negotiate`.
 * @internal
 */
export function negotiateLanguage(
  ranges: TLanguageRange[],
  available: readonly string[],
): string | undefined {
  const lower = available.map((a) => a.toLowerCase())
  const excluded = new Set<number>()
  let excludeAll = false
  for (const { tag, q } of ranges) {
    if (q !== 0) {
      continue
    }
    if (tag === '*') {
      excludeAll = true
      continue
    }
    lower.forEach((t, i) => rangeCovers(tag, t) && excluded.add(i))
  }
  const ok = (i: number) => i !== -1 && !excluded.has(i)
  const named = new Set(ranges.filter((r) => r.q > 0 && r.tag !== '*').map((r) => r.tag))
  for (const { tag, q } of ranges) {
    if (q === 0) {
      continue
    }
    if (tag === '*') {
      // any tag the client did not exclude (a `*;q=0` still allows tags it named with q > 0)
      const i = lower.findIndex((t, j) => ok(j) && (!excludeAll || named.has(t)))
      if (i !== -1) {
        return available[i]
      }
      continue
    }
    let i = lower.indexOf(tag)
    if (ok(i)) {
      return available[i]
    }
    i = lower.findIndex((t, j) => ok(j) && t.startsWith(`${tag}-`))
    if (i !== -1) {
      return available[i]
    }
    for (let cut = tag.lastIndexOf('-'); cut > 0; cut = tag.lastIndexOf('-', cut - 1)) {
      i = lower.indexOf(tag.slice(0, cut))
      if (ok(i)) {
        return available[i]
      }
    }
  }
  return undefined
}

/**
 * Reads the request's `Accept-Language` header and picks a language from the ones your app has.
 *
 * `negotiate(available, fallback?)` tries the client's ranges by preference (`q`, then order):
 * an exact tag (case-insensitive), else the first of `available` the range is a prefix of
 * (`en` → `en-US`), else the range shortened (`de-CH` → `de`); `*` takes the first tag not
 * excluded with `q=0`. Returns the tag as spelled in `available`, or `fallback`.
 * A `q=0` range excludes every tag it covers, even one a more specific range lists
 * (`en;q=0, en-US` excludes `en-US` too).
 * **Every call adds `Vary: Accept-Language`** to the response, since its result shapes it.
 *
 * Only the header: precedence over a `?lang` query, a cookie or a user setting is your policy —
 * see `createHttpApp({ resolveLocale })` and `useLocale()`.
 *
 * @example
 * ```ts
 * const lang = useAcceptLanguage().negotiate(['en', 'de', 'pt-BR'], 'en')
 * ```
 */
export const useAcceptLanguage = defineWook((ctx: EventContext) => {
  const header = ctx.get(httpKind.keys.req).headers['accept-language']
  let ranges: TLanguageRange[] | undefined
  const getRanges = () => (ranges ??= parseAcceptLanguage(header))

  function negotiate(available: readonly string[]): string | undefined
  function negotiate(available: readonly string[], fallback: string): string
  function negotiate(available: readonly string[], fallback?: string): string | undefined {
    ctx.get(httpKind.keys.response)?.vary('Accept-Language')
    return negotiateLanguage(getRanges(), available) ?? fallback
  }

  return {
    /** The raw `Accept-Language` header. */
    acceptLanguage: header,
    /** Acceptable language ranges, most preferred first (`q=0` ranges excluded). */
    languages: () =>
      getRanges()
        .filter((r) => r.q > 0)
        .map((r) => r.raw),
    negotiate,
  }
})
