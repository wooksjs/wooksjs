import { createHash } from 'crypto'

/** Options for {@link prerenderJson}. */
export interface TPrerenderJsonOptions {
  /**
   * Also compute a weak `ETag` from the serialized bytes. Responses that send the object then
   * carry the `ETag` header and answer a matching `If-None-Match` (GET/HEAD, status 200) with
   * `304 Not Modified`.
   */
  etag?: boolean
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

function weakEtag(json: string): string {
  return `W/"${createHash('sha256').update(json).digest('base64url').slice(0, 22)}"`
}

/**
 * Serializes `obj` to JSON once and remembers the string by object identity. Whenever a handler
 * (or an interceptor) responds with that same object, the response reuses the stored JSON instead
 * of calling `JSON.stringify` again. Use it for large, long-lived response objects that many
 * requests return as is — e.g. a schema or metadata envelope built once and cached.
 *
 * With `{ etag: true }` a weak `ETag` is derived from the serialized bytes; a `GET`/`HEAD`
 * that responds `200` with the object sets the `ETag` header and answers a matching
 * `If-None-Match` with `304 Not Modified` (no body; other headers such as `Cache-Control`
 * and `Vary` are kept). Error responses never become `304`. An `ETag` header set explicitly
 * on the response wins and disables the `304` handling for that response.
 *
 * **Contract: never mutate a registered object (or anything it references).** The stored JSON
 * is not refreshed, so a mutation would keep serving the old bytes. Build a new object instead —
 * freezing registered objects (`Object.freeze`, deeply) in development makes violations throw.
 *
 * Calling it again for the same object is a no-op (it adds the `ETag` if it was not requested
 * the first time). Entries are held weakly and disappear with the object.
 *
 * @param obj - A JSON-serializable object or array
 * @param options - `{ etag: true }` to also compute a weak ETag
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
  if (options?.etag && !entry.etag) {
    entry.etag = weakEtag(entry.json)
  }
  return obj
}

/** @internal Returns the pre-serialized JSON (and weak ETag) registered for `obj`, if any. */
export function getPrerenderedJson(obj: object): TPrerendered | undefined {
  return registry.get(obj)
}

/** @internal Weak comparison of `etag` against an `If-None-Match` header value. */
export function ifNoneMatchHas(header: string | undefined, etag: string): boolean {
  if (!header) {
    return false
  }
  const opaque = etag.startsWith('W/') ? etag.slice(2) : etag
  for (const part of header.split(',')) {
    const tag = part.trim()
    if (tag === '*' || (tag.startsWith('W/') ? tag.slice(2) : tag) === opaque) {
      return true
    }
  }
  return false
}
