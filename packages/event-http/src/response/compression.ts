import { brotliCompress, constants, gzip } from 'node:zlib'

import type { HttpResponse } from './http-response'

/** Content codings supported by response compression, in the order they are listed by default. */
export type THttpCompressionEncoding = 'br' | 'gzip'

/**
 * Response compression settings — the `compression` option of `createHttpApp()` and the
 * argument of `HttpResponse.setCompression()`.
 */
export interface THttpCompressionOptions {
  /** Minimum body size in bytes to compress. Smaller bodies are sent as is. @default 1024 */
  threshold?: number
  /**
   * Codings the server may use, in preference order. The client's `Accept-Encoding` q-values
   * decide first; this order breaks ties. @default ['br', 'gzip']
   */
  encodings?: THttpCompressionEncoding[]
  /** Brotli quality (0–11). Higher is smaller and much slower — keep 4–5 for dynamic bodies. @default 4 */
  brotliQuality?: number
  /** Gzip level (1–9). @default 6 */
  gzipLevel?: number
  /**
   * Decides whether a response with this content type may be compressed.
   * Replaces the default check — call `isCompressibleType(contentType)` inside to extend it.
   * @default isCompressibleType
   */
  filter?: (contentType: string, response: HttpResponse) => boolean
}

/** Fully resolved compression settings (what `HttpResponse.compression` returns). */
export interface TResolvedHttpCompression {
  threshold: number
  encodings: THttpCompressionEncoding[]
  brotliQuality: number
  gzipLevel: number
  filter: (contentType: string, response: HttpResponse) => boolean
}

const COMPRESSIBLE_TYPE =
  /^(?:text\/(?!event-stream)|image\/svg\+xml|application\/(?:json|javascript|x-javascript|ecmascript|xml|xhtml\+xml|graphql|x-ndjson|ndjson|wasm|x-www-form-urlencoded)\b)|\+(?:json|xml)\b/i

/**
 * Default compression filter: `text/*` (except `text/event-stream`), JSON and `+json`, XML and
 * `+xml`, JavaScript, SVG, NDJSON, WASM and form-urlencoded content types.
 */
export function isCompressibleType(contentType: string): boolean {
  return COMPRESSIBLE_TYPE.test(contentType)
}

const DEFAULTS: TResolvedHttpCompression = {
  threshold: 1024,
  encodings: ['br', 'gzip'],
  brotliQuality: 4,
  gzipLevel: 6,
  filter: isCompressibleType,
}

/**
 * @internal Resolves the `compression` option. `base` supplies the values `value` does not set
 * (the app settings for a per-response override). Returns `undefined` when compression is off.
 */
export function resolveCompression(
  value: boolean | THttpCompressionOptions | undefined,
  base: TResolvedHttpCompression = DEFAULTS,
): TResolvedHttpCompression | undefined {
  if (!value) {
    return undefined
  }
  if (value === true) {
    return base
  }
  return {
    threshold: value.threshold ?? base.threshold,
    encodings: value.encodings ?? base.encodings,
    brotliQuality: value.brotliQuality ?? base.brotliQuality,
    gzipLevel: value.gzipLevel ?? base.gzipLevel,
    filter: value.filter ?? base.filter,
  }
}

/**
 * Picks the content coding for a response from the request's `Accept-Encoding` header.
 *
 * The coding with the highest client q-value wins; `supported` order breaks ties. `q=0`
 * excludes a coding, `*` matches every coding not listed explicitly. Returns `undefined` when
 * the header is missing or none of `supported` is acceptable — send the body uncompressed then.
 *
 * @example
 * ```ts
 * negotiateEncoding('gzip, deflate, br', ['br', 'gzip']) // 'br'
 * negotiateEncoding('br;q=0.5, gzip', ['br', 'gzip'])     // 'gzip'
 * negotiateEncoding('*;q=0, identity', ['br', 'gzip'])    // undefined
 * ```
 */
export function negotiateEncoding<T extends string>(
  acceptEncoding: string | string[] | undefined,
  supported: readonly T[],
): T | undefined {
  if (!acceptEncoding) {
    return undefined
  }
  const header = Array.isArray(acceptEncoding) ? acceptEncoding.join(',') : acceptEncoding
  const listed = new Map<string, number>()
  let wildcard: number | undefined
  for (const part of header.split(',')) {
    const semi = part.indexOf(';')
    const name = (semi === -1 ? part : part.slice(0, semi)).trim().toLowerCase()
    if (!name) {
      continue
    }
    const q = semi === -1 ? 1 : parseQ(part.slice(semi + 1))
    if (name === '*') {
      wildcard = q
    } else {
      listed.set(name, q)
    }
  }
  let best: T | undefined
  let bestQ = 0
  for (const enc of supported) {
    const q = listed.get(enc) ?? wildcard ?? 0
    if (q > bestQ) {
      best = enc
      bestQ = q
    }
  }
  return best
}

function parseQ(params: string): number {
  for (const param of params.split(';')) {
    const eq = param.indexOf('=')
    if (eq !== -1 && param.slice(0, eq).trim().toLowerCase() === 'q') {
      const q = Number(param.slice(eq + 1).trim())
      return Number.isFinite(q) && q > 0 ? Math.min(q, 1) : 0
    }
  }
  return 1
}

/** @internal Compresses a rendered body of `size` bytes with the given coding (async, libuv threadpool). */
export function compressResponseBody(
  body: string | Uint8Array,
  size: number,
  encoding: THttpCompressionEncoding,
  opts: TResolvedHttpCompression,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const done = (error: Error | null, result: Buffer) => {
      if (error) {
        reject(error)
      } else {
        resolve(result)
      }
    }
    if (encoding === 'br') {
      brotliCompress(
        body,
        {
          params: {
            [constants.BROTLI_PARAM_QUALITY]: opts.brotliQuality,
            [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_TEXT,
            [constants.BROTLI_PARAM_SIZE_HINT]: size,
          },
        },
        done,
      )
    } else {
      gzip(body, { level: opts.gzipLevel }, done)
    }
  })
}

/** @internal Cache key for compressed bytes of a prerendered body (coding + level). */
export function compressionCacheKey(
  encoding: THttpCompressionEncoding,
  opts: TResolvedHttpCompression,
): string {
  return encoding === 'br' ? `br${opts.brotliQuality}` : `gzip${opts.gzipLevel}`
}

/**
 * @internal Appends `token` to a `Vary` header value unless it (or `*`) is already listed.
 * Returns `undefined` when nothing has to change.
 */
export function mergeVary(
  existing: string | string[] | undefined,
  token: string,
): string | undefined {
  if (!existing || existing.length === 0) {
    return token
  }
  const value = Array.isArray(existing) ? existing.join(', ') : existing
  const lower = token.toLowerCase()
  for (const part of value.split(',')) {
    const name = part.trim().toLowerCase()
    if (name === lower || name === '*') {
      return undefined
    }
  }
  return value.trim() ? `${value}, ${token}` : token
}
