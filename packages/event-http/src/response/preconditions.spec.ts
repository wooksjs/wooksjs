import { describe, expect, it } from 'vitest'

import { checkPreconditions } from './http-response'

/*
 * Review R4-L2 — `*` in If-Match / If-None-Match means "a current representation exists".
 * `validators.exists` says whether it does; default: it has an ETag or a Last-Modified.
 */
describe('checkPreconditions — existence and `*`', () => {
  it.each([
    // [method, headers, validators, expected]
    ['GET', { 'if-match': '*' }, {}, 412],
    ['PUT', { 'if-match': '*' }, {}, 412],
    ['PUT', { 'if-match': '*' }, { exists: false, etag: '"a"' }, 412],
    ['PUT', { 'if-match': '*' }, { etag: '"a"' }, undefined],
    ['PUT', { 'if-match': '*' }, { lastModified: 'Thu, 01 Jan 2026 00:00:00 GMT' }, undefined],
    ['PUT', { 'if-match': '*' }, { exists: true }, undefined],
    ['GET', { 'if-none-match': '*' }, {}, undefined],
    ['GET', { 'if-none-match': '*' }, { exists: true }, 304],
    ['GET', { 'if-none-match': '*' }, { lastModified: 'Thu, 01 Jan 2026 00:00:00 GMT' }, 304],
    ['PUT', { 'if-none-match': '*' }, { etag: '"a"' }, 412], // create-only write on an existing resource
    ['PUT', { 'if-none-match': '*' }, {}, undefined], // create-only write: nothing there yet
    ['PUT', { 'if-none-match': '*' }, { exists: false, lastModified: 0 }, undefined],
    ['GET', { 'if-match': '"a"' }, { etag: 'W/"a"' }, 412], // weak tags never satisfy If-Match
  ] as const)('%s %j %j → %s', (method, headers, validators, expected) => {
    expect(checkPreconditions(method, headers, validators)).toBe(expected)
  })
})
