import { describe, expect, it } from 'vitest'

import { currentConnection, useWsConnection } from '../composables/connection'
import { useWsMessage } from '../composables/message'
import { setAdapterState } from '../composables/state'
import { prepareTestWsConnectionContext, prepareTestWsMessageContext } from '../testing'
import { WsConnection } from '../ws-connection'
import { EventContext } from '@wooksjs/event-core'
import { WsRoomManager } from '../ws-room-manager'

// Set up minimal adapter state for composables
function setupAdapterState() {
  const connections = new Map<string, WsConnection>()
  const roomManager = new WsRoomManager()
  setAdapterState({
    connections,
    roomManager,
    serializer: JSON.stringify,
    wooks: {} as any,
  })
  return { connections, roomManager }
}

describe('currentConnection()', () => {
  it('must return connection context from connection handler', () => {
    const runInCtx = prepareTestWsConnectionContext({ id: 'conn-1' })
    runInCtx(() => {
      const ctx = currentConnection()
      expect(ctx).toBeInstanceOf(EventContext)
      // In connection context, parent is undefined — returns current()
      expect(ctx.parent).toBeUndefined()
    })
  })

  it('must return connection context from message handler', () => {
    const runInCtx = prepareTestWsMessageContext({
      id: 'conn-1',
      event: 'test',
      path: '/test',
    })
    runInCtx(() => {
      const ctx = currentConnection()
      expect(ctx).toBeInstanceOf(EventContext)
      // In message context, returns parent (connection ctx)
      expect(ctx.parent).toBeUndefined()
    })
  })
})

describe('useWsConnection()', () => {
  it('must return connection id and methods', () => {
    const { connections } = setupAdapterState()
    const runInCtx = prepareTestWsConnectionContext({ id: 'conn-42' })
    runInCtx(() => {
      // Register mock connection in adapter state
      const mockConn = new WsConnection(
        'conn-42',
        { send: () => {}, close: () => {}, on: () => {}, ping: () => {}, readyState: 1 },
        currentConnection(),
        JSON.stringify,
      )
      connections.set('conn-42', mockConn)

      const { id, send, close, context } = useWsConnection()
      expect(id).toBe('conn-42')
      expect(typeof send).toBe('function')
      expect(typeof close).toBe('function')
      expect(context).toBeInstanceOf(EventContext)
    })
  })
})

describe('useWsMessage()', () => {
  it('must return message data from message context', () => {
    const runInCtx = prepareTestWsMessageContext({
      event: 'message',
      path: '/chat/lobby',
      data: { text: 'hello' },
      messageId: 42,
    })
    runInCtx(() => {
      const { data, path, event, id, raw } = useWsMessage<{ text: string }>()
      expect(data).toEqual({ text: 'hello' })
      expect(path).toBe('/chat/lobby')
      expect(event).toBe('message')
      expect(id).toBe(42)
      expect(raw).toBeDefined()
    })
  })
})

describe('parent context chain', () => {
  it('must traverse parent chain from message to connection to HTTP context', () => {
    // Simulate an HTTP parent context (as event-http would create during upgrade)
    const httpCtx = new EventContext({ logger: console as any })
    const runInCtx = prepareTestWsMessageContext({
      event: 'test',
      path: '/test',
      parentCtx: httpCtx,
    })
    runInCtx(() => {
      const connCtx = currentConnection()
      expect(connCtx).toBeInstanceOf(EventContext)
      // Connection context's parent should be the HTTP context
      expect(connCtx.parent).toBe(httpCtx)
    })
  })
})
