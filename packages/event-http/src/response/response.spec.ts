import { beforeEach, describe, expect, it } from 'vitest'

import { useResponse } from '../composables/response'
import { prepareTestHttpContext } from '../testing'
import { HttpResponse } from './http-response'

describe('HttpResponse', () => {
  let runInContext: ReturnType<typeof prepareTestHttpContext>
  beforeEach(() => {
    runInContext = prepareTestHttpContext({ url: '' })
  })

  it('must render body from json', () => {
    runInContext(() => {
      const response = useResponse()
      response.body = { a: 'a', b: [1, 2, 3] }
      expect((response as any).renderBody()).toEqual('{"a":"a","b":[1,2,3]}')
    })
  })

  it('must render body from text', () => {
    runInContext(() => {
      const response = useResponse()
      response.body = 'hello world'
      expect((response as any).renderBody()).toEqual('hello world')
    })
  })

  it('must render body from boolean', () => {
    runInContext(() => {
      const response = useResponse()
      response.body = true
      expect((response as any).renderBody()).toEqual('true')
    })
  })

  it('must be an instance of HttpResponse', () => {
    runInContext(() => {
      const response = useResponse()
      expect(response).toBeInstanceOf(HttpResponse)
    })
  })
})
