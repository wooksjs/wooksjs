import { IncomingMessage, ServerResponse } from 'http'
import { Socket } from 'net'
import { createHttpContext } from '@wooksjs/event-http'
// import { serveFile } from './serve-file'

describe('serve-file', () => {
    const req = new IncomingMessage(new Socket({}))
    const res = new ServerResponse(req)

    beforeEach(() => {
        createHttpContext({ req, res })
    })
    it('', () => {
        // const r = serveFile('package.json')
        // expect(await r.respond()).toBeUndefined()
    })
})
