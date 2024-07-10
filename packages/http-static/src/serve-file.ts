/* eslint-disable @typescript-eslint/prefer-optional-chain */
/* eslint-disable @typescript-eslint/no-unnecessary-condition */
/* eslint-disable unicorn/explicit-length-check */
/* eslint-disable radix */
import type { TCacheControl } from '@wooksjs/event-http'
import {
  BaseHttpResponse,
  HttpError,
  useHeaders,
  useRequest,
  useResponse,
  useSetCacheControl,
  useSetHeaders,
} from '@wooksjs/event-http'
import type { Stats } from 'fs'
import { createReadStream, promises as fsPromises } from 'fs'
import path from 'path'
import type { Readable } from 'stream'

import { getMimeType } from './mime'
import { normalizePath } from './utils/path-norm'

const { stat, readdir } = fsPromises

interface TServeFileOptions {
  headers?: Record<string, string>
  cacheControl?: TCacheControl
  expires?: Date | string | number
  pragmaNoCache?: boolean
  baseDir?: string
  defaultExt?: string
  listDirectory?: boolean
  index?: string
  allowDotDot?: boolean
}

export async function serveFile(
  filePath: string,
  options: TServeFileOptions = {}
): Promise<Readable | string | string[] | unknown> {
  if (!options.allowDotDot && (filePath.includes('/../') || filePath.startsWith('../'))) {
    throw new Error('Parent Traversal ("/../") is not allowed.')
  }

  const { status } = useResponse()
  const { setHeader, removeHeader } = useSetHeaders()
  const headers = useHeaders()
  const { method, url } = useRequest()
  const { setCacheControl, setExpires, setPragmaNoCache } = useSetCacheControl()

  const normalizedPath: string = normalizePath(filePath, options.baseDir)

  let fileStats: Stats
  try {
    fileStats = await stat(normalizedPath)
  } catch (error) {
    if (options.defaultExt) {
      const ext = path.extname(filePath)
      if (!ext) {
        return serveFile(`${filePath}.${options.defaultExt}`)
      }
    }
    throw new HttpError(404)
  }

  status(200)

  // if-none-match & if-modified-since processing start
  // rfc7232
  const etag = `"${[fileStats.ino, fileStats.size, fileStats.mtime.toISOString()].join('-')}"`
  const lastModified = new Date(fileStats.mtime)
  if (
    isNotModified(
      etag,
      lastModified,
      headers['if-none-match'] || '',
      headers['if-modified-since'] || ''
    )
  ) {
    status(304)
    return ''
  }
  // if-none-match & if-modified-since processing end

  setHeader('etag', etag)
  setHeader('last-modified', lastModified.toUTCString())
  if (options.cacheControl !== undefined) {
    setCacheControl(options.cacheControl)
  }
  if (options.expires) {
    setExpires(options.expires)
  }
  if (options.pragmaNoCache) {
    setPragmaNoCache(options.pragmaNoCache)
  }

  if (fileStats.isDirectory()) {
    if (options.listDirectory) {
      return listDirectory(normalizedPath)
    } else if (options.index) {
      if (!filePath.endsWith('/') && url && !url.endsWith('/')) {
        return new BaseHttpResponse().setStatus(302).setHeader('location', `${url}/`)
      }
      return serveFile(path.join(filePath, options.index), {
        ...options,
        index: '',
      })
    }
    removeHeader('etag')
    removeHeader('last-modified')
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
      .replace(/bytes=/, '')
      .split('-')
    const [s, e] = rangeParts
    start = Number.parseInt(s)
    end = e ? Number.parseInt(e) : size - 1
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
      // If the validator does not match, the server MUST ignore
      // the Range header field.
      status(200)
      size = fileStats.size
      range = ''
    } else {
      // If the validator given in the If-Range header field matches the
      // current validator for the selected representation of the target
      // resource, then the server SHOULD process the Range header field as
      // requested.
      setHeader('content-range', `bytes ${start}-${end}/${fileStats.size}`)
      status(206)
    }
    // if-range processing end
  }
  // range header processing end

  setHeader('accept-ranges', 'bytes')

  setHeader('content-type', getMimeType(normalizedPath) || 'application/octet-stream')
  setHeader('content-length', size)

  if (options.headers) {
    for (const header of Object.keys(options.headers)) {
      setHeader(header, options.headers[header])
    }
  }

  return method === 'HEAD'
    ? ''
    : createReadStream(normalizedPath, range ? { start, end } : undefined)
}

// function toWeak(etag: string): string {
//     return `W/${etag}`
// }

function isNotModified(
  etag: string,
  lastModified: Date,
  clientEtag: string,
  clientLM: string
): boolean {
  if (clientEtag) {
    const parts = clientEtag.split(',').map(v => v.trim())
    for (const p of parts) {
      if (etag === p) {
        return true
      }
    }
    // A recipient MUST ignore If-Modified-Since if the request contains an
    // If-None-Match header field; the condition in If-None-Match is
    // considered to be a more accurate replacement for the condition in
    // If-Modified-Since, and the two are only combined for the sake of
    // interoperating with older intermediaries that might not implement
    // If-None-Match.
    return false
  }
  const date = new Date(clientLM)
  // A recipient MUST ignore the If-Modified-Since header field if the
  // received field-value is not a valid HTTP-date, or if the request
  // method is neither GET nor HEAD.
  if (date.toString() !== 'Invalid Date' && date.getTime() > lastModified.getTime()) {
    return true
  }
  return false
}

async function listDirectory(dirPath: string) {
  const { setContentType } = useSetHeaders()
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
  detailedList = detailedList.sort((a, b) =>
    a.dir === b.dir ? (a.name > b.name ? 1 : -1) : a.dir > b.dir ? -1 : 1
  )
  detailedList.unshift({ name: '..', dir: true } as {
    name: string
    size: number
    mtime: Date
    dir: boolean
  })
  setContentType('text/html')
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
      d =>
        `<li> <span class="icon">${d.dir ? '&#128193;' : '&#128462;'}</span>` +
        `<a href="${path.join(url || '', d.name)}"><span class="name text">${d.name}</span></a>` +
        `<span class="size text">${
          (d.size &&
            (d.size > 10000
              ? `${Math.round(d.size / 1024 / 1024).toString()}Mb`
              : `${Math.round(d.size / 1024).toString()}Kb`)) ||
          ''
        }</span>` +
        `<span class="date text">${(d.mtime && d.mtime.toISOString()) || ''}</li>`
    )
    .join('\n')}</ul></body></html>`
}
