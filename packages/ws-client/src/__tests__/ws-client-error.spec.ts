import { describe, expect, it } from 'vitest'

import { WsClientError } from '../ws-client-error'

describe('WsClientError', () => {
  it('must store code and message', () => {
    const err = new WsClientError(403, 'Forbidden')
    expect(err.code).toBe(403)
    expect(err.message).toBe('Forbidden')
    expect(err.name).toBe('WsClientError')
    expect(err).toBeInstanceOf(Error)
  })

  it('must use default message when none provided', () => {
    const err = new WsClientError(500)
    expect(err.message).toBe('WsClientError 500')
  })
})
