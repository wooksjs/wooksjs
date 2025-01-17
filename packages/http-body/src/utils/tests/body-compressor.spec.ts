import { describe, expect, it } from 'vitest'

import { compressBody, uncompressBody } from '../body-compressor'

describe('body-compressor', () => {
  it('must compress ""', async () => {
    expect(await compressBody([], 'test')).toEqual('test')
  })
  it('must uncompress ""', async () => {
    expect(await uncompressBody([], 'test')).toEqual('test')
  })
  it('must compress "identity"', async () => {
    expect(await compressBody(['identity'], 'test')).toEqual('test')
  })
  it('must uncompress "identity"', async () => {
    expect(await uncompressBody(['identity'], 'test')).toEqual('test')
  })
})
