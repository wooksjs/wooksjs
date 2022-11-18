import { useSearchParams } from '../search-params'
import { setTestWooksContext } from '../../testing'

describe('compasble/search-params', () => {
    const url = 'test.com/path?a[]=1&a[]=2&b=3&c=4&encoded=%7e%20%25'

    beforeEach(() => {
        setTestWooksContext({ url })
    })

    it('must parse search params', () => {
        const { jsonSearchParams } = useSearchParams()
        expect(jsonSearchParams()).toEqual({
            'a[]': ['1', '2'],
            b: '3',
            c: '4',
            encoded: '~ %',
        })
    })
})
