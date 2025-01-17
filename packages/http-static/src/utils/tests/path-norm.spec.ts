import { describe, expect, it } from 'vitest'

import { normalizePath } from '../path-norm'

describe('path.norm', () => {
  it('must normalize path with absolute base dir', () => {
    expect(normalizePath('file.js', '/from/root')).toEqual('/from/root/file.js')
  })
  it('must normalize path with relative base dir', () => {
    expect(normalizePath('file.js', 'dir')).toMatch(/^\/.+\/dir\/file\.js$/u)
  })
  it('must normalize path for absolute file path', () => {
    expect(normalizePath('/my/abs/file.js')).toEqual('/my/abs/file.js')
  })
  it('must normalize path for relative file path', () => {
    expect(normalizePath('./file.js')).toMatch(/^\/.+\/file\.js$/u)
  })
})
