import { describe, expect, it } from 'vitest'

import { HttpError } from '@wooksjs/event-http'
import { safeJsonParse } from '../utils/safe-json'

describe('safeJsonParse', () => {
  it('should parse valid JSON string', () => {
    expect(safeJsonParse('{"a":1}')).toEqual({ a: 1 })
  })

  it('should parse JSON arrays', () => {
    expect(safeJsonParse('[1,2,3]')).toEqual([1, 2, 3])
  })

  it('should parse primitives', () => {
    expect(safeJsonParse('"hello"')).toBe('hello')
    expect(safeJsonParse('42')).toBe(42)
    expect(safeJsonParse('true')).toBe(true)
    expect(safeJsonParse('null')).toBeNull()
  })

  it('should parse nested objects', () => {
    const input = JSON.stringify({ a: { b: { c: 1 } } })
    expect(safeJsonParse(input)).toEqual({ a: { b: { c: 1 } } })
  })

  it('should throw HttpError 400 for __proto__ key', () => {
    const input = '{"__proto__":{"polluted":true}}'
    expect(() => safeJsonParse(input)).toThrow(HttpError)
    expect(() => safeJsonParse(input)).toThrow('Illegal key name "__proto__"')
  })

  it('should throw HttpError 400 for constructor key', () => {
    const input = '{"constructor":{"polluted":true}}'
    expect(() => safeJsonParse(input)).toThrow(HttpError)
    expect(() => safeJsonParse(input)).toThrow('Illegal key name "constructor"')
  })

  it('should throw HttpError 400 for prototype key', () => {
    const input = '{"prototype":{"polluted":true}}'
    expect(() => safeJsonParse(input)).toThrow(HttpError)
    expect(() => safeJsonParse(input)).toThrow('Illegal key name "prototype"')
  })

  it('should throw for illegal keys nested in objects', () => {
    const input = '{"a":{"b":{"__proto__":{}}}}'
    expect(() => safeJsonParse(input)).toThrow('Illegal key name "__proto__"')
  })

  it('should throw for illegal keys inside arrays', () => {
    const input = JSON.stringify([{ safe: 1 }, { constructor: {} }])
    expect(() => safeJsonParse(input)).toThrow('Illegal key name "constructor"')
  })

  it('should throw SyntaxError for invalid JSON', () => {
    expect(() => safeJsonParse('{invalid}')).toThrow(SyntaxError)
  })

  it('should allow safe keys without throwing', () => {
    const input = JSON.stringify({ name: 'test', value: 42, nested: { ok: true } })
    expect(safeJsonParse(input)).toEqual({ name: 'test', value: 42, nested: { ok: true } })
  })
})
