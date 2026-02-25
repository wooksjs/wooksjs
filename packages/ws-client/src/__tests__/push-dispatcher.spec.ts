import { describe, expect, it, vi } from 'vitest'

import { PushDispatcher } from '../push-dispatcher'
import type { WsClientPushEvent } from '../types'

describe('PushDispatcher', () => {
  describe('exact match', () => {
    it('must dispatch to exact path listener', () => {
      const dispatcher = new PushDispatcher()
      const handler = vi.fn()

      dispatcher.on('message', '/chat/lobby', handler)
      dispatcher.dispatch({ event: 'message', path: '/chat/lobby', data: { text: 'hi' } })

      expect(handler).toHaveBeenCalledOnce()
      expect(handler).toHaveBeenCalledWith({
        event: 'message',
        path: '/chat/lobby',
        params: {},
        data: { text: 'hi' },
      })
    })

    it('must not dispatch to non-matching path', () => {
      const dispatcher = new PushDispatcher()
      const handler = vi.fn()

      dispatcher.on('message', '/chat/lobby', handler)
      dispatcher.dispatch({ event: 'message', path: '/chat/other' })

      expect(handler).not.toHaveBeenCalled()
    })

    it('must not dispatch to non-matching event', () => {
      const dispatcher = new PushDispatcher()
      const handler = vi.fn()

      dispatcher.on('message', '/chat/lobby', handler)
      dispatcher.dispatch({ event: 'update', path: '/chat/lobby' })

      expect(handler).not.toHaveBeenCalled()
    })

    it('must support multiple handlers for same event:path', () => {
      const dispatcher = new PushDispatcher()
      const h1 = vi.fn()
      const h2 = vi.fn()

      dispatcher.on('message', '/chat/lobby', h1)
      dispatcher.on('message', '/chat/lobby', h2)
      dispatcher.dispatch({ event: 'message', path: '/chat/lobby' })

      expect(h1).toHaveBeenCalledOnce()
      expect(h2).toHaveBeenCalledOnce()
    })

    it('must unregister exact handler', () => {
      const dispatcher = new PushDispatcher()
      const handler = vi.fn()

      const off = dispatcher.on('message', '/chat/lobby', handler)
      off()
      dispatcher.dispatch({ event: 'message', path: '/chat/lobby' })

      expect(handler).not.toHaveBeenCalled()
    })
  })

  describe('wildcard match', () => {
    it('must dispatch to wildcard listener', () => {
      const dispatcher = new PushDispatcher()
      const handler = vi.fn()

      dispatcher.on('message', '/chat/*', handler)
      dispatcher.dispatch({ event: 'message', path: '/chat/lobby', params: { room: 'lobby' } })

      expect(handler).toHaveBeenCalledOnce()
      expect(handler).toHaveBeenCalledWith({
        event: 'message',
        path: '/chat/lobby',
        params: { room: 'lobby' },
        data: undefined,
      })
    })

    it('must match nested paths with wildcard', () => {
      const dispatcher = new PushDispatcher()
      const handler = vi.fn()

      dispatcher.on('update', '/api/*', handler)
      dispatcher.dispatch({ event: 'update', path: '/api/users/123/profile' })

      expect(handler).toHaveBeenCalledOnce()
    })

    it('must not match wrong event with wildcard', () => {
      const dispatcher = new PushDispatcher()
      const handler = vi.fn()

      dispatcher.on('message', '/chat/*', handler)
      dispatcher.dispatch({ event: 'update', path: '/chat/lobby' })

      expect(handler).not.toHaveBeenCalled()
    })

    it('must unregister wildcard handler', () => {
      const dispatcher = new PushDispatcher()
      const handler = vi.fn()

      const off = dispatcher.on('message', '/chat/*', handler)
      off()
      dispatcher.dispatch({ event: 'message', path: '/chat/lobby' })

      expect(handler).not.toHaveBeenCalled()
    })
  })

  describe('mixed exact + wildcard', () => {
    it('must dispatch to both exact and wildcard listeners', () => {
      const dispatcher = new PushDispatcher()
      const exact = vi.fn()
      const wildcard = vi.fn()

      dispatcher.on('message', '/chat/lobby', exact)
      dispatcher.on('message', '/chat/*', wildcard)
      dispatcher.dispatch({ event: 'message', path: '/chat/lobby' })

      expect(exact).toHaveBeenCalledOnce()
      expect(wildcard).toHaveBeenCalledOnce()
    })
  })

  it('must clear all listeners', () => {
    const dispatcher = new PushDispatcher()
    const h1 = vi.fn()
    const h2 = vi.fn()

    dispatcher.on('message', '/chat/lobby', h1)
    dispatcher.on('message', '/chat/*', h2)
    dispatcher.clear()
    dispatcher.dispatch({ event: 'message', path: '/chat/lobby' })

    expect(h1).not.toHaveBeenCalled()
    expect(h2).not.toHaveBeenCalled()
  })

  it('must pass params from server', () => {
    const dispatcher = new PushDispatcher()
    let received: WsClientPushEvent | undefined

    dispatcher.on('message', '/chat/lobby', (ev) => {
      received = ev
    })
    dispatcher.dispatch({
      event: 'message',
      path: '/chat/lobby',
      params: { room: 'lobby' },
      data: { text: 'hello' },
    })

    expect(received).toEqual({
      event: 'message',
      path: '/chat/lobby',
      params: { room: 'lobby' },
      data: { text: 'hello' },
    })
  })
})
