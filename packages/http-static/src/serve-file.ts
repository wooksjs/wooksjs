import type { TCacheControl } from '@wooksjs/event-http'
import {
  HttpError,
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

/** Options for configuring static file serving behavior. */
interface TServeFileOptions {
  /** Additional response headers to set. */
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
        return serveFile(`${filePath}.${options.defaultExt}`)
      }
    }
    throw new HttpError(404)
  }

  response.status = 200

  // if-none-match & if-modified-since processing start
  // rfc7232
  const etag = `"${[fileStats.ino, fileStats.size, fileStats.mtime.toISOString()].join('-')}"`
  const lastModified = new Date(fileStats.mtime)
  if (
    isNotModified(
      etag,
      lastModified,
      headers['if-none-match'] || '',
      headers['if-modified-since'] || '',
    )
  ) {
    response.status = 304
    return ''
  }
  // if-none-match & if-modified-since processing end

  response.setHeader('etag', etag)
  response.setHeader('last-modified', lastModified.toUTCString())
  if (options.cacheControl !== undefined) {
    response.setCacheControl(options.cacheControl)
  }
  if (options.expires) {
    response.setExpires(options.expires)
  }
  if (options.pragmaNoCache) {
    response.setPragmaNoCache(options.pragmaNoCache)
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

  // range header processing start
  let range = headers.range
  let start
  let end
  let size = fileStats.size
  if (range) {
    const rangeParts = range
      .trim()
      .replace(/bytes=/u, '')
      .split('-')
    const [s, e] = rangeParts
    start = Number.parseInt(s, 10)
    end = e ? Number.parseInt(e, 10) : size - 1
    end = Math.min(size - 1, end)
    if (start > end || Number.isNaN(start) || Number.isNaN(end)) {
      throw new HttpError(416)
    }
    size = end - start + 1

    // if-range processing start
    // rfc7233#section-3.2\
    const ifRange = (headers['if-range'] as string) || ''
    const ifRangeTag = ifRange.startsWith('"') ? ifRange : ''
    const ifRangeDate = ifRangeTag ? '' : ifRange
    if (ifRange && !isNotModified(etag, lastModified, ifRangeTag, ifRangeDate)) {
      response.status = 200
      size = fileStats.size
      range = ''
    } else {
      response.setHeader('content-range', `bytes ${start}-${end}/${fileStats.size}`)
      response.status = 206
    }
    // if-range processing end
  }
  // range header processing end

  response.setHeader('accept-ranges', 'bytes')

  response.setHeader('content-type', getMimeType(normalizedPath) || 'application/octet-stream')
  response.setHeader('content-length', size)

  if (options.headers) {
    for (const header of Object.keys(options.headers)) {
      response.setHeader(header, options.headers[header])
    }
  }

  return method === 'HEAD'
    ? ''
    : createReadStream(normalizedPath, range ? { start, end } : undefined)
}

function isNotModified(
  etag: string,
  lastModified: Date,
  clientEtag: string,
  clientLM: string,
): boolean {
  if (clientEtag) {
    const parts = clientEtag.split(',').map((v) => v.trim())
    for (const p of parts) {
      if (etag === p) {
        return true
      }
    }
    return false
  }
  const date = new Date(clientLM)
  if (date.toString() !== 'Invalid Date' && date.getTime() > lastModified.getTime()) {
    return true
  }
  return false
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
