import { createHttpApp } from '@wooksjs/event-http'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { headerValues, listenLocal, rawRequest } from '../../../test-utils/raw-http'
import { serveFile } from './serve-file'

/*
 * Review R4-M1 (static path) — `serveFile` with `options.headers` / cache options in any casing
 * sends ONE line per header name, and Content-Length equals the bytes sent (HEAD: GET's).
 */

const CASINGS: Array<(n: string) => string> = [
  (n) => n.toLowerCase(),
  (n) => n,
  (n) => n.toUpperCase(),
]
let dir: string
let app: ReturnType<typeof createHttpApp>
let port: number

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wooks-static-raw-'))
  fs.writeFileSync(path.join(dir, 'a.txt'), 'hello world')
  app = createHttpApp()
  for (const [i, casing] of CASINGS.entries()) {
    app.all(`/a${i}`, () =>
      serveFile('a.txt', {
        baseDir: dir,
        cacheControl: { maxAge: 60 },
        headers: {
          [casing('Content-Type')]: 'text/x-custom',
          [casing('Cache-Control')]: 'max-age=5',
          [casing('Content-Length')]: '11',
          [casing('X-Extra')]: '1',
        },
      }),
    )
  }
  port = await listenLocal(app)
})
afterAll(async () => {
  await app.close()
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('serveFile: one header line per name', () => {
  for (const [i] of CASINGS.entries()) {
    for (const [label, headers] of [
      ['plain', {}],
      ['range', { Range: 'bytes=0-1' }],
      ['304', { 'If-None-Match': '*' }],
    ] as const) {
      it(`casing ${i}, ${label}`, async () => {
        for (const method of ['GET', 'HEAD']) {
          const res = await rawRequest(port, method, `/a${i}`, headers)
          const names = res.headers.map(([k]) => k.toLowerCase())
          expect(names.length, `${method}: ${names.join(',')}`).toBe(new Set(names).size)
          const len = headerValues(res, 'content-length')[0]
          if (method === 'GET' && len !== undefined) {
            expect(Number(len)).toBe(res.body.length)
          }
        }
      })
    }
  }
})
