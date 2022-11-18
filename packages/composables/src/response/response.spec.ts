import { BaseWooksResponse } from './core'
import { createWooksResponder } from './factory'
import { BaseWooksResponseRenderer } from './renderer'
import { createWooksCtx } from '../core'
import { IncomingMessage, ServerResponse } from 'http'
import { Socket } from 'net'

const baseRenderer = new BaseWooksResponseRenderer()
describe('response', () => {
    const req = new IncomingMessage(new Socket({}))
    const res = new ServerResponse(req)

    beforeEach(() => {
        createWooksCtx({ req, res })
    })

    it('must create response from json', () => {
        const response = createWooksResponder().createResponse({a: 'a', b: [1,2,3]}) as BaseWooksResponse<unknown>
        expect(baseRenderer.render(response)).toEqual('{"a":"a","b":[1,2,3]}')
    })

    it('must create response from text', () => {
        const response = createWooksResponder().createResponse('hello world') as BaseWooksResponse<unknown>
        expect(baseRenderer.render(response)).toEqual('hello world')
    })

    it('must create response boolean', () => {
        const response = createWooksResponder().createResponse(true) as BaseWooksResponse<unknown>
        expect(baseRenderer.render(response)).toEqual('true')
    })
})
