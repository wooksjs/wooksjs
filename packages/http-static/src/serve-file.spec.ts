import { prepareTestHttpContext } from '@wooksjs/event-http'
import path from 'path'
import { beforeEach, describe, expect, it } from 'vitest'

import { normalizePath } from './utils/path-norm'

// import { serveFile } from './serve-file'

describe('serve-file', () => {
  beforeEach(() => {
    prepareTestHttpContext({ url: '/' })
  })
  it('must normalize path', () => {
    const file = normalizePath(path.join('/from/root', 'file.js'), './base')
    expect(file).toEqual('base/from/root/file.js')
  })
})
