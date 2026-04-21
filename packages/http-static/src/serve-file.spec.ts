import { HttpError, prepareTestHttpContext } from '@wooksjs/event-http'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { serveFile } from './serve-file'
import { normalizePath } from './utils/path-norm'

describe('serve-file', () => {
  beforeEach(() => {
    prepareTestHttpContext({ url: '/' })
  })
  it('must normalize path', () => {
    const file = normalizePath(path.join('/from/root', 'file.js'), './base')
    expect(file).toEqual('base/from/root/file.js')
  })
})

describe('serve-file defaultExt + baseDir confinement', () => {
  let tmpBase: string
  let publicDir: string
  let originalCwd: string

  beforeEach(() => {
    tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'wooks-static-test-'))
    publicDir = path.join(tmpBase, 'public')
    fs.mkdirSync(publicDir)
    fs.writeFileSync(path.join(publicDir, 'foo.json'), '{"scope":"public"}')
    fs.writeFileSync(path.join(tmpBase, 'secret.json'), '{"scope":"secret"}')
    originalCwd = process.cwd()
    process.chdir(tmpBase)
  })

  afterEach(() => {
    process.chdir(originalCwd)
    fs.rmSync(tmpBase, { recursive: true, force: true })
  })

  it('resolves a no-extension path to the defaultExt file inside baseDir', async () => {
    const runInContext = prepareTestHttpContext({ url: '/foo' })
    await runInContext(async () => {
      const result = (await serveFile('foo', {
        baseDir: publicDir,
        defaultExt: 'json',
      })) as NodeJS.ReadableStream
      const chunks: Buffer[] = []
      for await (const chunk of result) {
        chunks.push(chunk as Buffer)
      }
      expect(Buffer.concat(chunks).toString()).toBe('{"scope":"public"}')
    })
  })

  it('does not escape baseDir via defaultExt recursion (regression)', async () => {
    const runInContext = prepareTestHttpContext({ url: '/secret' })
    await runInContext(async () => {
      // Before the fix, the options were dropped on recursion and the
      // traversal check ran against process.cwd(), so `secret` would resolve
      // to `<cwd>/secret.json` (outside baseDir) and be served.
      let caught: unknown
      try {
        await serveFile('secret', { baseDir: publicDir, defaultExt: 'json' })
      } catch (error) {
        caught = error
      }
      expect(caught).toBeInstanceOf(HttpError)
      expect((caught as HttpError).body.statusCode).toBe(404)
    })
  })

  it('returns 404 (no infinite recursion) when defaultExt file does not exist', async () => {
    const runInContext = prepareTestHttpContext({ url: '/nope' })
    await runInContext(async () => {
      let caught: unknown
      try {
        await serveFile('nonexistent', { baseDir: publicDir, defaultExt: 'json' })
      } catch (error) {
        caught = error
      }
      expect(caught).toBeInstanceOf(HttpError)
      expect((caught as HttpError).body.statusCode).toBe(404)
    })
  })
})
