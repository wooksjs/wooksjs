import { describe, expect, it } from 'vitest'

import { prepareTestHttpContext } from '../../testing'
import { securityHeaders } from '../../utils/security-headers'
import { useResponse } from '../response'

describe('securityHeaders()', () => {
  it('returns all 6 default headers', () => {
    const headers = securityHeaders()
    expect(Object.keys(headers)).toHaveLength(6)
    expect(headers['content-security-policy']).toBe(
      "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'",
    )
    expect(headers['cross-origin-opener-policy']).toBe('same-origin')
    expect(headers['cross-origin-resource-policy']).toBe('same-origin')
    expect(headers['referrer-policy']).toBe('no-referrer')
    expect(headers['x-content-type-options']).toBe('nosniff')
    expect(headers['x-frame-options']).toBe('SAMEORIGIN')
    expect(headers['strict-transport-security']).toBeUndefined()
  })

  it('disables a header when set to false', () => {
    const headers = securityHeaders({ contentSecurityPolicy: false })
    expect(headers['content-security-policy']).toBeUndefined()
    expect(Object.keys(headers)).toHaveLength(5)
  })

  it('overrides a header value', () => {
    const headers = securityHeaders({
      referrerPolicy: 'strict-origin-when-cross-origin',
    })
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin')
  })

  it('enables opt-in HSTS header', () => {
    const headers = securityHeaders({
      strictTransportSecurity: 'max-age=31536000; includeSubDomains',
    })
    expect(headers['strict-transport-security']).toBe(
      'max-age=31536000; includeSubDomains',
    )
    expect(Object.keys(headers)).toHaveLength(7)
  })

  it('disables multiple headers', () => {
    const headers = securityHeaders({
      contentSecurityPolicy: false,
      crossOriginOpenerPolicy: false,
      crossOriginResourcePolicy: false,
    })
    expect(Object.keys(headers)).toHaveLength(3)
    expect(headers['referrer-policy']).toBe('no-referrer')
    expect(headers['x-content-type-options']).toBe('nosniff')
    expect(headers['x-frame-options']).toBe('SAMEORIGIN')
  })
})

describe('defaultHeaders', () => {
  it('pre-populates response headers from defaultHeaders', () => {
    const run = prepareTestHttpContext({
      url: '/test',
      defaultHeaders: { 'x-custom': 'value', 'x-another': 'test' },
    })

    run(() => {
      const response = useResponse()
      expect(response.getHeader('x-custom')).toBe('value')
      expect(response.getHeader('x-another')).toBe('test')
    })
  })

  it('allows handler to override default headers', () => {
    const run = prepareTestHttpContext({
      url: '/test',
      defaultHeaders: { 'x-custom': 'default' },
    })

    run(() => {
      const response = useResponse()
      expect(response.getHeader('x-custom')).toBe('default')
      response.setHeader('x-custom', 'overridden')
      expect(response.getHeader('x-custom')).toBe('overridden')
    })
  })

  it('allows handler to remove default headers', () => {
    const run = prepareTestHttpContext({
      url: '/test',
      defaultHeaders: { 'x-custom': 'value' },
    })

    run(() => {
      const response = useResponse()
      response.removeHeader('x-custom')
      expect(response.getHeader('x-custom')).toBeUndefined()
    })
  })

  it('works with securityHeaders preset', () => {
    const run = prepareTestHttpContext({
      url: '/test',
      defaultHeaders: securityHeaders(),
    })

    run(() => {
      const response = useResponse()
      expect(response.getHeader('x-content-type-options')).toBe('nosniff')
      expect(response.getHeader('referrer-policy')).toBe('no-referrer')
    })
  })

  it('has no default headers when not specified', () => {
    const run = prepareTestHttpContext({ url: '/test' })

    run(() => {
      const response = useResponse()
      expect(response.headers()).toEqual({})
    })
  })
})

describe('response.setHeaders()', () => {
  it('batch-sets multiple headers', () => {
    const run = prepareTestHttpContext({ url: '/test' })

    run(() => {
      const response = useResponse()
      response.setHeaders({ 'x-one': '1', 'x-two': '2' })
      expect(response.getHeader('x-one')).toBe('1')
      expect(response.getHeader('x-two')).toBe('2')
    })
  })

  it('overrides existing headers', () => {
    const run = prepareTestHttpContext({
      url: '/test',
      defaultHeaders: { 'x-one': 'old' },
    })

    run(() => {
      const response = useResponse()
      response.setHeaders({ 'x-one': 'new', 'x-two': '2' })
      expect(response.getHeader('x-one')).toBe('new')
      expect(response.getHeader('x-two')).toBe('2')
    })
  })

  it('is chainable', () => {
    const run = prepareTestHttpContext({ url: '/test' })

    run(() => {
      const response = useResponse()
      const result = response.setHeaders({ 'x-one': '1' })
      expect(result).toBe(response)
    })
  })

  it('works with securityHeaders per-endpoint', () => {
    const run = prepareTestHttpContext({ url: '/test' })

    run(() => {
      const response = useResponse()
      response.setHeaders(
        securityHeaders({ contentSecurityPolicy: "default-src 'self' cdn.example.com" }),
      )
      expect(response.getHeader('content-security-policy')).toBe(
        "default-src 'self' cdn.example.com",
      )
      expect(response.getHeader('x-content-type-options')).toBe('nosniff')
    })
  })
})
