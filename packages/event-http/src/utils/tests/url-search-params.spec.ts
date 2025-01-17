import { describe, expect, it } from 'vitest'

import { WooksURLSearchParams } from '../url-search-params'

describe('url-search-params', () => {
  const sp = new WooksURLSearchParams('a[]=1&a[]=2&b=3&c=4&encoded=%7e%20%25')

  it('must parse search params', () => {
    expect(sp.toJson()).toEqual({
      'a[]': ['1', '2'],
      'b': '3',
      'c': '4',
      'encoded': '~ %',
    })
  })
})
