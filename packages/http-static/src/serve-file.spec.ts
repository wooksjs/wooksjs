import { createHttpContext } from '@wooksjs/event-http'
import { IncomingMessage, ServerResponse } from 'http'
import { Socket } from 'net'
import path from 'path'

import { normalizePath } from './utils/path-norm'

// import { serveFile } from './serve-file'

describe('serve-file', () => {
  const req = new IncomingMessage(new Socket({}))
  const res = new ServerResponse(req)

  beforeEach(() => {
    createHttpContext({ req, res }, {})
  })
  it('must normalize path', () => {
    const file = normalizePath(path.join('/from/root', 'file.js'), './base')
    expect(file).toEqual('base/from/root/file.js')
  })
})
