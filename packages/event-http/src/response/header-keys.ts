/*
 * Header-key casing helpers shared by the response classes and the adapter (internal: not
 * exported from the package).
 */

/** Header records already keyed by lower-case name (see {@link lowerCaseHeaders}). */
const preLowered = new WeakSet<object>()

/**
 * @internal A copy of `headers` keyed by lower-case name, marked so `HttpResponse` can clone it
 * per response with a plain spread instead of folding every key again. The adapter lowers its
 * `defaultHeaders` once, at creation.
 */
export function lowerCaseHeaders(
  headers: Record<string, string | string[]>,
): Record<string, string | string[]> {
  const out = foldHeaderKeys(headers)
  preLowered.add(out)
  return out
}

/** @internal A copy of `headers` keyed by lower-case name (a later casing of a name wins). */
export function foldHeaderKeys(
  headers: Record<string, string | string[]>,
): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {}
  for (const key in headers) {
    out[key.toLowerCase()] = headers[key]
  }
  return out
}

/** @internal Whether `headers` came from {@link lowerCaseHeaders}. */
export function isLowerCaseHeaders(headers: object): boolean {
  return preLowered.has(headers)
}

/**
 * @internal `renderError` implementations known to write lower-case header keys only: the
 * headers need no folding after them. Any other (a subclass's) is folded.
 */
export const lowerCaseRenderErrors = new WeakSet<object>()
