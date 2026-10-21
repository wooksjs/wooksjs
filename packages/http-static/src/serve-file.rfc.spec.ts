import { createHttpApp } from '@wooksjs/event-http'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { serveFile } from './serve-file'

/*
 * serveFile against an RFC 9110 oracle, generated over
 *   method × preconditions × Range forms × If-Range forms × "file modified this second".
 *
 * Oracle (written from the RFC, independent of the implementation):
 *  §13.2.2 preconditions first, in order —
 *    If-Match fails (strong comparison; `*` = exists) → 412; else If-Unmodified-Since (valid
 *    date) earlier than Last-Modified → 412;
 *    If-None-Match matches (weak, lists, `*`) → 304 for GET/HEAD, 412 for any other method;
 *    else If-Modified-Since (GET/HEAD only; one valid HTTP-date, not in the future) and the file
 *    is not newer at whole seconds → 304.
 *  §14.2 Range — only for GET; otherwise ignored (200 full).
 *  §13.1.5 If-Range — strong comparison: the exact ETag (a weak tag never matches) or a date
 *    equal to Last-Modified that is STRONG (§8.8.2.2: not modified within the current second);
 *    no match → ignore Range (200 full), even an invalid one.
 *  Range values — not `bytes=` (unit case-insensitive), several ranges, or bad syntax (`a>b`, non-digits) → ignore
 *    (200 full); `a-b` / `a-` with a ≥ size, `-0`, or any range on an empty file → 416 with
 *    `Content-Range: bytes * /size`; `-n` → the last n bytes; ends are clamped to the size.
 */

const CONTENT = 'hello world'
const SIZE = CONTENT.length
const MTIME = Date.UTC(2026, 0, 15, 10, 0, 0) + 700
const LM = new Date(MTIME).toUTCString()
const LM_EPOCH = Date.UTC(2026, 0, 15, 10, 0, 0)

let dir: string
let base: string
let app: ReturnType<typeof createHttpApp>
let etag: string

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(MTIME + 60_000)
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wooks-static-rfc-'))
  fs.writeFileSync(path.join(dir, 'a.txt'), CONTENT)
  fs.utimesSync(path.join(dir, 'a.txt'), MTIME / 1000, MTIME / 1000)
  app = createHttpApp()
  app.all('/a.txt', () => serveFile('a.txt', { baseDir: dir, cacheControl: { maxAge: 60 } }))
  await app.listen(0, '127.0.0.1')
  base = `http://127.0.0.1:${(app.getServer()!.address() as { port: number }).port}`
  etag = (await fetch(`${base}/a.txt`)).headers.get('etag')!
})
afterAll(async () => {
  vi.useRealTimers()
  await app.close()
  fs.rmSync(dir, { recursive: true, force: true })
})

const METHODS = ['GET', 'HEAD', 'POST', 'PUT']
const PRECONDITIONS: Record<string, () => Record<string, string>> = {
  none: () => ({}),
  'INM match': () => ({ 'if-none-match': etag }),
  'INM weak match': () => ({ 'if-none-match': `W/${etag}` }),
  'INM *': () => ({ 'if-none-match': '*' }),
  'INM other': () => ({ 'if-none-match': '"other"' }),
  'IMS equal': () => ({ 'if-modified-since': LM }),
  'IMS earlier': () => ({ 'if-modified-since': new Date(MTIME - 2000).toUTCString() }),
  'IM match': () => ({ 'if-match': etag }),
  'IM weak form': () => ({ 'if-match': `W/${etag}` }),
  'IM stale': () => ({ 'if-match': '"stale"' }),
  'IM *': () => ({ 'if-match': '*' }),
  'IM stale + INM match': () => ({ 'if-match': '"stale"', 'if-none-match': etag }),
  'IUS equal': () => ({ 'if-unmodified-since': LM }),
  'IUS earlier': () => ({ 'if-unmodified-since': new Date(MTIME - 2000).toUTCString() }),
  'IUS invalid': () => ({ 'if-unmodified-since': '2026' }),
  'IUS in the future': () => ({ 'if-unmodified-since': 'Thu, 01 Jan 2099 00:00:00 GMT' }),
}
const RANGES = [
  undefined,
  'bytes=0-1',
  'BYTES=0-1', // range units are case-insensitive (RFC 9110 §14.1)
  'Bytes=-3',
  'bytes=6-',
  'bytes=-3',
  'bytes=-0',
  'bytes=-20',
  'bytes=20-30',
  'bytes=9-1',
  'bytes=0-1,4-5',
  'items=0-1',
  'bytes=abc',
  'bytes=5-100',
]
const IF_RANGES: Record<string, () => string | undefined> = {
  none: () => undefined,
  'strong etag': () => etag,
  'weak etag': () => `W/${etag}`,
  'other tag': () => '"other"',
  'LM date': () => LM,
  'later date': () => new Date(MTIME + 5000).toUTCString(),
  'invalid date': () => '2026',
}

/** Field-order-independent form of an Expected, for comparison. */
function canonical(e: Expected): string {
  return JSON.stringify([e.status, e.body, e.contentRange, e.cache])
}

interface Expected {
  status: number
  body?: string
  contentRange?: string
  /** failures (412 / 416) are never storable (RFC 9111): no-store replaces the file's max-age */
  cache?: string
}

function weakEq(a: string, b: string) {
  return a.replace(/^W\//u, '') === b.replace(/^W\//u, '')
}

function oracle(
  method: string,
  pre: Record<string, string>,
  range: string | undefined,
  ifRange: string | undefined,
  sameSecond: boolean,
  imsEpoch: number | undefined,
  iusEpoch: number | undefined,
): Expected {
  const full: Expected = { status: 200, body: method === 'HEAD' ? '' : CONTENT }
  // §13.2.2 order: If-Match (strong; `*` = exists) → If-Unmodified-Since → If-None-Match → IMS
  const im = pre['if-match']
  if (im !== undefined) {
    if (!im.split(',').some((t) => t.trim() === '*' || t.trim() === etag)) {
      return { status: 412 }
    }
  } else if (iusEpoch !== undefined && LM_EPOCH > iusEpoch) {
    return { status: 412 }
  }
  const inm = pre['if-none-match']
  if (inm !== undefined) {
    const matches = inm.split(',').some((t) => t.trim() === '*' || weakEq(t.trim(), etag))
    if (matches) {
      return { status: method === 'GET' || method === 'HEAD' ? 304 : 412 }
    }
  } else if (
    imsEpoch !== undefined &&
    (method === 'GET' || method === 'HEAD') &&
    LM_EPOCH <= imsEpoch
  ) {
    return { status: 304 }
  }
  if (method !== 'GET' || range === undefined) {
    return full
  }
  if (ifRange !== undefined) {
    const ok =
      ifRange.startsWith('"') || ifRange.startsWith('W/')
        ? ifRange === etag
        : ifRange === LM && !sameSecond
    if (!ok) {
      return full
    }
  }
  if (!range.toLowerCase().startsWith('bytes=')) {
    return full
  }
  const spec = range.slice(6)
  if (spec.includes(',')) {
    return full
  }
  const m = /^(\d*)-(\d*)$/u.exec(spec)
  if (!m || (m[1] === '' && m[2] === '')) {
    return full
  }
  const unsatisfiable: Expected = { status: 416, contentRange: `bytes */${SIZE}` }
  let first: number
  let last: number
  if (m[1] === '') {
    const n = Number(m[2])
    if (n === 0) {
      return unsatisfiable
    }
    first = Math.max(0, SIZE - n)
    last = SIZE - 1
  } else {
    first = Number(m[1])
    last = m[2] === '' ? SIZE - 1 : Number(m[2])
    if (first > last) {
      return full
    }
    if (first >= SIZE) {
      return unsatisfiable
    }
    last = Math.min(last, SIZE - 1)
  }
  return {
    status: 206,
    body: CONTENT.slice(first, last + 1),
    contentRange: `bytes ${first}-${last}/${SIZE}`,
  }
}

const IMS_EPOCH: Record<string, number | undefined> = {
  'IMS equal': LM_EPOCH,
  'IMS earlier': LM_EPOCH - 2000,
}
/** Valid If-Unmodified-Since values (by precondition name); others are invalid → ignored. */
const IUS_EPOCH: Record<string, number | undefined> = {
  'IUS equal': LM_EPOCH,
  'IUS earlier': LM_EPOCH - 2000,
  'IUS in the future': Date.UTC(2099, 0, 1),
}

describe('serveFile — generated against an RFC 9110 oracle', () => {
  for (const sameSecond of [false, true]) {
    for (const method of METHODS) {
      it(`${method}${sameSecond ? ', file modified within the current second' : ''}`, async () => {
        vi.setSystemTime(sameSecond ? MTIME + 200 : MTIME + 60_000)
        const mismatches: string[] = []
        for (const [pName, pre] of Object.entries(PRECONDITIONS)) {
          for (const range of RANGES) {
            for (const [irName, ir] of Object.entries(IF_RANGES)) {
              const headers: Record<string, string> = { ...pre() }
              if (range !== undefined) {
                headers.range = range
              }
              const ifRange = ir()
              if (ifRange !== undefined) {
                headers['if-range'] = ifRange
              }
              const expected = oracle(
                method,
                headers,
                range,
                ifRange,
                sameSecond,
                IMS_EPOCH[pName],
                IUS_EPOCH[pName],
              )
              const res = await fetch(`${base}/a.txt`, { method, headers })
              const text = await res.text()
              expected.cache = expected.status >= 400 ? 'no-store' : 'max-age=60'
              const got: Expected = {
                status: res.status,
                cache: res.headers.get('cache-control') ?? undefined,
              }
              if (expected.body !== undefined) {
                got.body = text
              }
              if (expected.contentRange !== undefined) {
                got.contentRange = res.headers.get('content-range') ?? undefined
              }
              if (canonical(got) !== canonical(expected)) {
                mismatches.push(
                  `${pName} | range ${range} | if-range ${irName}: got ${JSON.stringify(got)}, want ${JSON.stringify(expected)}`,
                )
              }
            }
          }
        }
        expect(mismatches.slice(0, 12), `${mismatches.length} mismatches`).toEqual([])
      })
    }
  }
})
