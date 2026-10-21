import { createHash } from 'crypto'

/** Options for {@link prerenderJson}. */
export interface TPrerenderJsonOptions {
  /**
   * An `ETag` for responses that send the object (GET/HEAD 2xx, unless the response sets its own):
   * - `true` — a weak tag computed from the serialized bytes;
   * - a string — your own entity tag, quoted: `'"rev-7"'` or `'W/"rev-7"'` (e.g. a version or
   *   content hash you already have, so nothing is hashed).
   *
   * A matching `If-None-Match` is then answered with `304 Not Modified` (that applies to any
   * response with an `ETag` — see the response docs). The computed tag is WEAK, and `If-Match`
   * never matches a weak tag (requests carrying it get `412`): pass a strong tag of your own for
   * optimistic concurrency.
   */
  etag?: boolean | string
}

/** @internal Registry entry for a prerendered object. */
export interface TPrerendered {
  json: string
  etag?: string
  /** UTF-8 byte length of `json`, computed on the first response that sends it. */
  size?: number
  /**
   * Compressed `json` per coding + level (see response compression), filled lazily on the first
   * compressed response: a pending Promise while compressing, then the bytes.
   */
  compressed?: Record<string, Buffer | Promise<Buffer>>
}

const registry = new WeakMap<object, TPrerendered>()

/** RFC 9110 §8.8.3 entity-tag: optional `W/`, then a quoted opaque tag without `"`. */
const ENTITY_TAG_RE = /^(?:W\/)?"[\u0021\u0023-\u007E\u0080-\uFFFF]*"$/u

function weakEtag(json: string): string {
  return `W/"${createHash('sha256').update(json).digest('base64url').slice(0, 22)}"`
}

/**
 * Serializes `obj` to JSON once and remembers the string by object identity. Whenever a handler
 * (or an interceptor) responds with that same object, the response reuses the stored JSON instead
 * of calling `JSON.stringify` again. Use it for large, long-lived response objects that many
 * requests return as is — e.g. a schema or metadata envelope built once and cached.
 *
 * With `{ etag: true }` a weak `ETag` is derived from the serialized bytes; `{ etag: '"rev-7"' }`
 * uses your own tag. A `GET`/`HEAD` that responds `200` with the object sets the `ETag` header
 * and answers a matching `If-None-Match` with `304 Not Modified` (no body; other headers such as
 * `Cache-Control` and `Vary` are kept). Error responses never become `304`. An `ETag` header set
 * explicitly on the response wins: it is sent instead, and `If-None-Match` is judged against it.
 *
 * **Contract: never mutate a registered object (or anything it references).** The stored JSON
 * is not refreshed, so a mutation would keep serving the old bytes. Build a new object instead —
 * freezing registered objects (`Object.freeze`, deeply) in development makes violations throw.
 *
 * Calling it again for the same object reuses the stored JSON (it adds a computed `ETag` if none
 * was requested before; a string `etag` replaces the stored one). Entries are held weakly and
 * disappear with the object.
 *
 * @param obj - A JSON-serializable object or array
 * @param options - `{ etag: true }` to compute a weak ETag, `{ etag: '"tag"' }` to set your own
 * @returns The same `obj`, so it can wrap a return value
 *
 * @example
 * ```ts
 * const envelope = prerenderJson(Object.freeze(buildMeta()), { etag: true })
 * app.get('/meta', () => {
 *   useResponse().setHeader('cache-control', 'private, no-cache')
 *   return envelope // sent without re-serializing; 304 on a matching If-None-Match
 * })
 * ```
 */
export function prerenderJson<T extends object>(obj: T, options?: TPrerenderJsonOptions): T {
  let entry = registry.get(obj)
  if (!entry) {
    const json = JSON.stringify(obj) as string | undefined
    if (typeof json !== 'string') {
      throw new TypeError('prerenderJson: value does not serialize to JSON')
    }
    entry = { json }
    registry.set(obj, entry)
  }
  const etag = options?.etag
  if (typeof etag === 'string') {
    if (!ENTITY_TAG_RE.test(etag)) {
      throw new TypeError(
        `prerenderJson: etag must be a quoted entity tag like '"v1"' or 'W/"v1"', got '${etag}'`,
      )
    }
    entry.etag = etag
  } else if (etag && !entry.etag) {
    entry.etag = weakEtag(entry.json)
  }
  return obj
}

/** @internal Returns the pre-serialized JSON (and weak ETag) registered for `obj`, if any. */
export function getPrerenderedJson(obj: object): TPrerendered | undefined {
  return registry.get(obj)
}
