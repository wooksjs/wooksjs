import { createHttpApp } from '@wooksjs/event-http'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { serveFile } from './serve-file'

/*
 * serveFile preconditions follow the same rules as every other response (RFC 9110 §13):
 *  - If-None-Match: weak comparison, lists and `*`; when present If-Modified-Since is ignored;
 *  - If-Modified-Since: ONE valid HTTP-date, not in the future, compared at whole seconds
 *    (a file modified at 10:00:00.700 is "not modified since 10:00:00");
 *  - preconditions are evaluated before Range (a matching If-None-Match → 304, not 206);
 *  - a 304 carries ETag, Last-Modified and Cache-Control, and no Content-* headers;
 *  - If-Range uses STRONG comparison: a weak tag never matches; a date must equal Last-Modified.
 */

const MTIME_MS = Date.UTC(2026, 0, 15, 10, 0, 0) + 700 // sub-second part
const LM = new Date(MTIME_MS).toUTCString() // 'Thu, 15 Jan 2026 10:00:00 GMT'
let dir: string
let base: string
let app: ReturnType<typeof createHttpApp>
let etag: string

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wooks-static-cond-'))
  fs.writeFileSync(path.join(dir, 'a.txt'), 'hello world')
  fs.utimesSync(path.join(dir, 'a.txt'), MTIME_MS / 1000, MTIME_MS / 1000)
  app = createHttpApp()
  app.get('/a.txt', () => serveFile('a.txt', { baseDir: dir, cacheControl: { maxAge: 60 } }))
  await app.listen(0, '127.0.0.1')
  base = `http://127.0.0.1:${(app.getServer()!.address() as { port: number }).port}`
  etag = (await fetch(`${base}/a.txt`)).headers.get('etag')!
})
afterAll(async () => {
  await app.close()
  fs.rmSync(dir, { recursive: true, force: true })
})

const get = (headers: Record<string, string>) => fetch(`${base}/a.txt`, { headers })

describe('serveFile conditional requests', () => {
  it.each([
    ['IMS equal to Last-Modified (sub-second mtime)', 304, () => ({ 'if-modified-since': LM })],
    [
      'IMS one second later',
      304,
      () => ({ 'if-modified-since': new Date(MTIME_MS + 1000).toUTCString() }),
    ],
    [
      'IMS one second earlier',
      200,
      () => ({ 'if-modified-since': new Date(MTIME_MS - 1000).toUTCString() }),
    ],
    ['IMS in the future', 200, () => ({ 'if-modified-since': 'Thu, 01 Jan 2099 00:00:00 GMT' })],
    ['IMS not an HTTP-date', 200, () => ({ 'if-modified-since': '2027' })],
    ['IMS ISO date', 200, () => ({ 'if-modified-since': '2027-01-01T00:00:00Z' })],
    ['INM strong', 304, () => ({ 'if-none-match': etag })],
    ['INM weak form', 304, () => ({ 'if-none-match': `W/${etag}` })],
    ['INM *', 304, () => ({ 'if-none-match': '*' })],
    ['INM in list', 304, () => ({ 'if-none-match': `"x", ${etag}` })],
    [
      'INM other + IMS later',
      200,
      () => ({ 'if-none-match': '"x"', 'if-modified-since': 'Thu, 01 Jan 2026 00:00:00 GMT' }),
    ],
    ['INM match + Range', 304, () => ({ 'if-none-match': etag, range: 'bytes=0-1' })],
  ] as const)('%s → %i', async (_label, status, headers) => {
    const res = await get(headers())
    expect(res.status).toBe(status)
    const text = await res.text()
    if (status === 304) {
      expect(text).toBe('')
      expect(res.headers.get('etag')).toBe(etag)
      expect(res.headers.get('last-modified')).toBe(LM)
      expect(res.headers.get('cache-control')).toBe('max-age=60')
      expect(res.headers.get('content-type')).toBeNull()
      expect(res.headers.get('content-length')).toBeNull()
    } else {
      expect(text).toBe('hello world')
    }
  })

  it.each([
    ['If-Range strong tag matches → 206', 206, () => ({ range: 'bytes=0-1', 'if-range': etag })],
    [
      'If-Range weak tag never matches → 200',
      200,
      () => ({ range: 'bytes=0-1', 'if-range': `W/${etag}` }),
    ],
    ['If-Range other tag → 200', 200, () => ({ range: 'bytes=0-1', 'if-range': '"x"' })],
    ['If-Range date equal → 206', 206, () => ({ range: 'bytes=0-1', 'if-range': LM })],
    [
      'If-Range date later → 200',
      200,
      () => ({ range: 'bytes=0-1', 'if-range': new Date(MTIME_MS + 5000).toUTCString() }),
    ],
    ['If-Range invalid date → 200', 200, () => ({ range: 'bytes=0-1', 'if-range': '2027' })],
  ] as const)('%s', async (_label, status, headers) => {
    const res = await get(headers())
    expect(res.status).toBe(status)
    expect(await res.text()).toBe(status === 206 ? 'he' : 'hello world')
  })
})
