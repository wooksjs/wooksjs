import { describe, expect, it } from 'vitest'

import { getMimeType } from '.'

describe('mime', () => {
  it('must parse path with extension', () => {
    expect(getMimeType('/some.path/.json.js')).toEqual('application/javascript')
    expect(getMimeType('/some.path/file.wasm')).toEqual('application/wasm')
    expect(getMimeType('/some.path/file.jpeg')).toEqual('image/jpeg')
  })
  it('must parse just extension', () => {
    expect(getMimeType('html')).toEqual('text/html')
    expect(getMimeType('xlsx')).toEqual(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
    expect(getMimeType('mp4')).toEqual('video/mp4')
  })
})
