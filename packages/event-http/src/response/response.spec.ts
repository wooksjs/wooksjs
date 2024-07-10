import { prepareTestHttpContext } from '../testing'
import type { BaseHttpResponse } from './core'
import { createWooksResponder } from './factory'
import { BaseHttpResponseRenderer } from './renderer'

const baseRenderer = new BaseHttpResponseRenderer()
describe('response', () => {
  let runInContext: ReturnType<typeof prepareTestHttpContext>
  beforeEach(() => {
    runInContext = prepareTestHttpContext({ url: '' })
  })

  it('must create response from json', () => {
    runInContext(() => {
      const response = createWooksResponder().createResponse({
        a: 'a',
        b: [1, 2, 3],
      }) as BaseHttpResponse
      expect(baseRenderer.render(response)).toEqual('{"a":"a","b":[1,2,3]}')
    })
  })

  it('must create response from text', () => {
    runInContext(() => {
      const response = createWooksResponder().createResponse('hello world') as BaseHttpResponse
      expect(baseRenderer.render(response)).toEqual('hello world')
    })
  })

  it('must create response boolean', () => {
    runInContext(() => {
      const response = createWooksResponder().createResponse(true) as BaseHttpResponse
      expect(baseRenderer.render(response)).toEqual('true')
    })
  })
})
