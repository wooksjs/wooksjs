import { IncomingMessage, ServerResponse } from 'http'
import { Socket } from 'net'
import { createWooksCtx } from '@wooksjs/composables'
// import { serveFile } from './serve-file'

describe('serve-file', () => {
    const req = new IncomingMessage(new Socket({}))
    const res = new ServerResponse(req)

    beforeEach(() => {
        createWooksCtx({ req, res })
    })
    it('', () => {
        // const r = serveFile('package.json')
        // expect(await r.respond()).toBeUndefined()
    })
})
