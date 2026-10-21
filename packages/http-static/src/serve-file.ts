import type { TCacheControl } from '@wooksjs/event-http'
import {
  EHttpStatusCode,
  HttpError,
  checkPreconditions,
  parseHttpDate,
  useHeaders,
  useRequest,
  useResponse,
} from '@wooksjs/event-http'
import type { Stats } from 'fs'
import { createReadStream, promises as fsPromises } from 'fs'
import path from 'path'
import type { Readable } from 'stream'

import { getMimeType } from './mime'
import { normalizePath } from './utils/path-norm'

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const { stat, readdir } = fsPromises

/** Headers that describe the bytes sent — `options.headers` never overrides them. */
const BYTE_HEADERS = new Set(['content-length', 'content-range', 'transfer-encoding'])

/** Options for configuring static file serving behavior. */
interface TServeFileOptions {
  /**
   * Additional response headers to set (any casing; they replace the computed ones, e.g.
   * Content-Type) — except Content-Length, Content-Range and Transfer-Encoding, which describe
   * the bytes sent.
   */
  headers?: Record<string, string>
  /** Cache-Control header directives. */
  cacheControl?: TCacheControl
  /** Expires header value as a Date, string, or timestamp. */
  expires?: Date | string | number
  /** When true, sets `Pragma: no-cache`. */
  pragmaNoCache?: boolean
  /** Base directory to resolve relative file paths against. */
  baseDir?: string
  /** Default file extension appended when the path has none. */
  defaultExt?: string
  /** When true, renders an HTML directory listing for directory paths. */
  listDirectory?: boolean
  /** Index filename (e.g. `'index.html'`) served when the path is a directory. */
  index?: string
  /** When true, allows `../` parent traversal in file paths. */
  allowDotDot?: boolean
}

/**
 * Serves a static file with support for ETags, range requests, cache control, and directory listing.
 *
 * @example
 * ```ts
 * app.get('/files/*', () => {
 *   return serveFile('public/readme.txt', {
 *     baseDir: '/var/www',
 *     cacheControl: { maxAge: 3600 },
 *   })
 * })
 * ```
 *
 * @param filePath - Path to the file or directory to serve.
 * @param options - Optional configuration for headers, caching, and directory behavior.
 * @returns A readable stream, string body, or HTML directory listing.
 */
export async function serveFile(
  filePath: string,
  options: TServeFileOptions = {},
): Promise<Readable | string | string[] | unknown> {
  const response = useResponse()
  const headers = useHeaders()
  const { method, url } = useRequest()

  const normalizedPath: string = normalizePath(filePath, options.baseDir)

  if (!options.allowDotDot) {
    const resolvedBase = path.resolve(options.baseDir || process.cwd())
    if (!normalizedPath.startsWith(resolvedBase + path.sep) && normalizedPath !== resolvedBase) {
      throw new HttpError(403, 'Path traversal is not allowed')
    }
  }

  let fileStats: Stats
  try {
    fileStats = await stat(normalizedPath)
  } catch {
    if (options.defaultExt) {
      const ext = path.extname(filePath)
      if (!ext) {
        return serveFile(`${filePath}.${options.defaultExt}`, {
          ...options,
          defaultExt: undefined,
        })
      }
    }
    throw new HttpError(404)
  }

  response.status = 200

  const etag = `"${[fileStats.ino, fileStats.size, fileStats.mtime.toISOString()].join('-')}"`
  const lastModified = fileStats.mtime.toUTCString()
  response.setHeader('etag', etag)
  response.setHeader('last-modified', lastModified)
  if (options.cacheControl !== undefined) {
    response.setCacheControl(options.cacheControl)
  }
  if (options.expires) {
    response.setExpires(options.expires)
  }
  if (options.pragmaNoCache) {
    response.setPragmaNoCache(options.pragmaNoCache)
  }

  // Preconditions before Range (RFC 9110 §13.2.2) — the same rules as every response:
  // 304 for GET/HEAD, 412 for any other method whose If-None-Match matches
  const verdict = checkPreconditions(method, headers, { etag, lastModified: fileStats.mtime })
  if (verdict === EHttpStatusCode.NotModified) {
    response.status = 304
    return ''
  }
  if (verdict === EHttpStatusCode.PreconditionFailed) {
    throw new HttpError(412)
  }

  if (fileStats.isDirectory()) {
    if (options.listDirectory) {
      return listDirectory(normalizedPath)
    } else if (options.index) {
      if (!filePath.endsWith('/') && url && !url.endsWith('/')) {
        return response.setStatus(302).setHeader('location', `${url}/`)
      }
      return serveFile(path.join(filePath, options.index), {
        ...options,
        index: '',
      })
    }
    response.removeHeader('etag')
    response.removeHeader('last-modified')
    throw new HttpError(404)
  }

  // Range (RFC 9110 §14.2) — GET only; a failed If-Range means "send it all" (§13.1.5)
  let size = fileStats.size
  let range: { start: number; end: number } | undefined
  const rangeHeader = method === 'GET' ? headers.range : undefined
  if (
    typeof rangeHeader === 'string' &&
    (headers['if-range'] === undefined ||
      ifRangeMatches(headers['if-range'], etag, fileStats.mtime))
  ) {
    const parsed = parseByteRange(rangeHeader, fileStats.size)
    if (parsed === 'unsatisfiable') {
      response.setHeader('content-range', `bytes */${fileStats.size}`)
      throw new HttpError(416)
    }
    if (parsed) {
      range = parsed
      size = parsed.end - parsed.start + 1
      response.setHeader('content-range', `bytes ${parsed.start}-${parsed.end}/${fileStats.size}`)
      response.status = 206
    }
  }

  response.setHeader('accept-ranges', 'bytes')

  response.setHeader('content-type', getMimeType(normalizedPath) || 'application/octet-stream')
  response.setHeader('content-length', size)

  if (options.headers) {
    for (const header of Object.keys(options.headers)) {
      // Content-Length / Content-Range / Transfer-Encoding describe the bytes sent — never overridden
      if (!BYTE_HEADERS.has(header.toLowerCase())) {
        response.setHeader(header, options.headers[header])
      }
    }
  }

  return method === 'HEAD' ? '' : createReadStream(normalizedPath, range)
}

/**
 * If-Range (RFC 9110 §13.1.5) uses STRONG comparison: an entity tag must equal ours exactly (a
 * weak tag never matches); a date must be a valid HTTP-date equal to Last-Modified, and that
 * Last-Modified must be strong — not within the current second (§8.8.2.2), when another change
 * in the same second would carry the same date.
 */
function ifRangeMatches(ifRange: string | string[], etag: string, mtime: Date): boolean {
  if (typeof ifRange !== 'string') {
    return false
  }
  const v = ifRange.trim()
  if (v.startsWith('"') || v.startsWith('W/')) {
    return v === etag
  }
  const date = parseHttpDate(v)
  // Last-Modified as sent: whole seconds
  const lm = Math.floor(mtime.getTime() / 1000) * 1000
  return date !== undefined && date === lm && Date.now() - lm >= 1000
}

/**
 * A single `bytes=` range (RFC 9110 §14.1.2) for a file of `size` bytes:
 * - `{ start, end }` (inclusive, end clamped to the size) for `a-b`, `a-` and `-n` (last n bytes);
 * - `'unsatisfiable'` (416) when it starts at or past the end, for `-0`, or for an empty file;
 * - `undefined` — ignore the header and send the whole file — for another unit, several ranges
 *   (allowed: a server may ignore Range) or invalid syntax.
 */
function parseByteRange(
  header: string,
  size: number,
): { start: number; end: number } | 'unsatisfiable' | undefined {
  const value = header.trim()
  // range units are case-insensitive (RFC 9110 §14.1)
  if (!value.toLowerCase().startsWith('bytes=')) {
    return undefined
  }
  const spec = value.slice(6).trim()
  if (spec.includes(',')) {
    return undefined
  }
  const m = /^(\d*)-(\d*)$/u.exec(spec)
  if (!m || (m[1] === '' && m[2] === '')) {
    return undefined
  }
  if (m[1] === '') {
    const n = Number(m[2])
    return n === 0 || size === 0 ? 'unsatisfiable' : { start: Math.max(0, size - n), end: size - 1 }
  }
  const start = Number(m[1])
  const end = m[2] === '' ? size - 1 : Number(m[2])
  if (start > end && m[2] !== '') {
    return undefined
  }
  if (start >= size) {
    return 'unsatisfiable'
  }
  return { start, end: Math.min(end, size - 1) }
}

async function listDirectory(dirPath: string) {
  const response = useResponse()
  const { url } = useRequest()
  const list = await readdir(dirPath)
  const promises = []
  let detailedList = []
  for (const item of list) {
    promises.push({ name: item, promise: stat(path.join(dirPath, item)) })
  }
  for (const item of promises) {
    const data = await item.promise
    detailedList.push({
      name: item.name,
      size: data.size,
      mtime: data.mtime,
      dir: data.isDirectory(),
    })
  }
  detailedList = detailedList.toSorted((a, b) =>
    a.dir === b.dir ? (a.name > b.name ? 1 : -1) : a.dir > b.dir ? -1 : 1,
  )
  detailedList.unshift({ name: '..', dir: true } as {
    name: string
    size: number
    mtime: Date
    dir: boolean
  })
  response.setContentType('text/html')
  const styles =
    '<style type="text/css">\nhtml { font-family: monospace }\n' +
    'span { padding: 0px 2px }\n' +
    '.text { text-overflow: ellipsis; overflow: hidden; white-space: nowrap; }\n' +
    '.icon { width: 20px; display: inline-block; text-align: center; }\n' +
    '.name { width: 250px; display: inline-block; }\n' +
    '.size { width: 80px; display: inline-block; color: grey; text-align: right; }\n' +
    '.date { width: 200px; display: inline-block; color: grey; text-align: right; }\n' +
    '\n</style>'
  return `<html><head><title>Dir</title> ${styles} </head><body><ul>${detailedList
    .map(
      (d) =>
        `<li> <span class="icon">${d.dir ? '&#128193;' : '&#128462;'}</span>` +
        `<a href="${escapeHtml(path.join(url || '', d.name))}"><span class="name text">${escapeHtml(d.name)}</span></a>` +
        `<span class="size text">${
          (d.size &&
            (d.size > 10000
              ? `${Math.round(d.size / 1024 / 1024).toString()}Mb`
              : `${Math.round(d.size / 1024).toString()}Kb`)) ||
          ''
        }</span>` +
        `<span class="date text">${(d.mtime && d.mtime.toISOString()) || ''}</li>`,
    )
    .join('\n')}</ul></body></html>`
}
