import { IncomingMessage, ServerResponse } from 'http'
import { Socket } from 'net'
import { createHttpContext } from '@wooksjs/event-http'
import path from 'path'
// import { serveFile } from './serve-file'

describe('serve-file', () => {
    const req = new IncomingMessage(new Socket({}))
    const res = new ServerResponse(req)

    beforeEach(() => {
        createHttpContext({ req, res }, {})
    })
    it('must normalize path', () => {
        const file = path.normalize(
            path.join(process.cwd(), '/from/root', 'file.js')
        )
        expect(file).toEqual('/from/root/file.js')
        // const r = serveFile('package.json')
        // expect(await r.respond()).toBeUndefined()
    })
})
