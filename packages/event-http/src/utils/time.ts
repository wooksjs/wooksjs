export type TTimeUnit = 'ms' | 's' | 'm' | 'h' | 'd' | 'w' | 'M' | 'Y'
export type TTimeSingleString = `${number}${TTimeUnit}`
export type TTimeMultiString = `${TTimeSingleString}${TTimeSingleString | ''}${
  | TTimeSingleString
  | ''}${TTimeSingleString | ''}`

const units: Record<TTimeUnit, number> = {
  ms: 1,
  s: 1000,
  m: 1000 * 60,
  h: 1000 * 60 * 60,
  d: 1000 * 60 * 60 * 24,
  w: 1000 * 60 * 60 * 24 * 7,
  M: 1000 * 60 * 60 * 24 * 30,
  Y: 1000 * 60 * 60 * 24 * 365,
}

/** One `<number><unit>` group; `ms` is listed before `m` so it wins. */
const PART_RE = /(\d+(?:\.\d+)?)\s*(ms|s|m|h|d|w|M|Y)\s*/y

/** Parses a duration string (`'90s'`, `'1h 30m'`, `'1.5h'`) into milliseconds. Throws on anything else. */
function parseDurationMs(time: string): number {
  const s = time.trim()
  PART_RE.lastIndex = 0
  let total = 0
  let parts = 0
  let r: RegExpExecArray | null
  while (PART_RE.lastIndex < s.length && (r = PART_RE.exec(s))) {
    total += Number(r[1]) * units[r[2] as TTimeUnit]
    parts++
  }
  if (parts === 0 || PART_RE.lastIndex !== s.length) {
    throw new TypeError(
      `Invalid duration "${time}": expected e.g. '90s', '1h 30m' or '1.5h' (units: ${Object.keys(units).join(', ')})`,
    )
  }
  return total
}

/**
 * Converts a duration to `unit`.
 * @param time - A number in `numberUnit`, or a duration string with units (`'1h 30m'`).
 * @param unit - The unit to return (default `'ms'`).
 * @param numberUnit - The unit a NUMBER `time` is in (default `'ms'`).
 * @throws TypeError for a non-finite number or a string that is not a duration.
 */
export function convertTime(
  time: number | TTimeMultiString,
  unit: TTimeUnit = 'ms',
  numberUnit: TTimeUnit = 'ms',
): number {
  if (typeof time === 'number') {
    if (!Number.isFinite(time)) {
      throw new TypeError(`Invalid duration ${time}: expected a finite number`)
    }
    return (time * units[numberUnit]) / units[unit]
  }
  return parseDurationMs(time) / units[unit]
}

/** Largest delta-seconds a cache must accept (RFC 9111 §1.2.2); larger values are clamped to it. */
const MAX_DELTA_SECONDS = 2_147_483_648

/**
 * Whole seconds for a header (`max-age`, `s-maxage`, `Max-Age`, `Age`): a NUMBER is seconds,
 * a string carries its units. Rounded down and clamped to [0, 2147483648], so the result is
 * always plain digits (never an exponent or a sign).
 */
export function toHeaderSeconds(time: number | TTimeMultiString): string {
  // The epsilon absorbs float noise from fractional units ('0.7h' = 2519.9999… s)
  const seconds = Math.floor(convertTime(time, 's', 's') + 1e-9)
  return String(Math.min(MAX_DELTA_SECONDS, Math.max(0, seconds)))
}
