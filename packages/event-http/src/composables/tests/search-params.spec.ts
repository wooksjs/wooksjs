import { prepareTestHttpContext } from '../../testing'
import { useSearchParams } from '../search-params'

describe('compasble/search-params', () => {
  const url = 'test.com/path?a[]=1&a[]=2&b=3&c=4&encoded=%7e%20%25'
  let runInContext: ReturnType<typeof prepareTestHttpContext>

  beforeEach(() => {
    runInContext = prepareTestHttpContext({ url })
  })

  it('must parse search params', () => {
    runInContext(() => {
      const { jsonSearchParams } = useSearchParams()
      expect(jsonSearchParams()).toEqual({
        'a[]': ['1', '2'],
        'b': '3',
        'c': '4',
        'encoded': '~ %',
      })
    })
  })
})
