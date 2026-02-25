import { describe, expect, it } from 'vitest'

import { WsError } from '../ws-error'

describe('WsError', () => {
  it('must store code and message', () => {
    const err = new WsError(401, 'Unauthorized')
    expect(err.code).toBe(401)
    expect(err.message).toBe('Unauthorized')
    expect(err.name).toBe('WsError')
    expect(err).toBeInstanceOf(Error)
  })

  it('must use default message when none provided', () => {
    const err = new WsError(500)
    expect(err.code).toBe(500)
    expect(err.message).toBe('WsError 500')
  })
})
