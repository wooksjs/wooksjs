import { describe, expect, it, vi } from 'vitest'

import { WsClient } from '../ws-client'
import { WsClientError } from '../ws-client-error'

// ── MockWebSocket ───────────────────────────────────────────

class MockWebSocket {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3

  readyState = MockWebSocket.CONNECTING
  sent: string[] = []

  private listeners = new Map<string, Array<(ev: any) => void>>()

  constructor(
    public url: string,
    public protocols?: string | string[],
  ) {}

  addEventListener(type: string, handler: (ev: any) => void) {
    const list = this.listeners.get(type) ?? []
    list.push(handler)
    this.listeners.set(type, list)
  }

  private emit(type: string, ev: any) {
    for (const h of this.listeners.get(type) ?? []) {
      h(ev)
    }
  }

  send(data: string) {
    this.sent.push(data)
  }

  close(_code?: number, _reason?: string) {
    this.readyState = MockWebSocket.CLOSED
  }

  // ── Test helpers ──

  simulateOpen() {
    this.readyState = MockWebSocket.OPEN
    this.emit('open', {} as Event)
  }

  simulateMessage(data: string) {
    this.emit('message', { data } as MessageEvent)
  }

  simulateClose(code = 1000, reason = '') {
    this.readyState = MockWebSocket.CLOSED
    this.emit('close', { code, reason } as CloseEvent)
  }

  simulateError() {
    this.emit('error', {} as Event)
  }
}

// Track all created MockWebSocket instances
let mockInstances: MockWebSocket[] = []

function createMockWsClass() {
  mockInstances = []
  return class extends MockWebSocket {
    constructor(url: string, protocols?: string | string[]) {
      super(url, protocols)
      mockInstances.push(this)
    }
  } as unknown as new (url: string, protocols?: string | string[]) => WebSocket
}

function lastMock(): MockWebSocket {
  return mockInstances[mockInstances.length - 1]
}

// ── Tests ───────────────────────────────────────────────────

describe('WsClient', () => {
  describe('connection', () => {
    it('must connect to the provided URL', () => {
      const MockWs = createMockWsClass()
      const _client = new WsClient('ws://localhost:3000/ws', { _WebSocket: MockWs })

      expect(mockInstances).toHaveLength(1)
      expect(lastMock().url).toBe('ws://localhost:3000/ws')
    })

    it('must pass protocols to WebSocket constructor', () => {
      const MockWs = createMockWsClass()
      const _client = new WsClient('ws://localhost:3000', {
        _WebSocket: MockWs,
        protocols: ['v1', 'v2'],
      })

      expect(lastMock().protocols).toEqual(['v1', 'v2'])
    })

    it('must fire onOpen handler', () => {
      const MockWs = createMockWsClass()
      const client = new WsClient('ws://localhost:3000', { _WebSocket: MockWs })
      const handler = vi.fn()
      client.onOpen(handler)

      lastMock().simulateOpen()
      expect(handler).toHaveBeenCalledOnce()
    })

    it('must fire onClose handler', () => {
      const MockWs = createMockWsClass()
      const client = new WsClient('ws://localhost:3000', { _WebSocket: MockWs })
      const handler = vi.fn()
      client.onClose(handler)

      lastMock().simulateOpen()
      lastMock().simulateClose(1001, 'Going away')
      expect(handler).toHaveBeenCalledWith(1001, 'Going away')
    })

    it('must fire onError handler', () => {
      const MockWs = createMockWsClass()
      const client = new WsClient('ws://localhost:3000', { _WebSocket: MockWs })
      const handler = vi.fn()
      client.onError(handler)

      lastMock().simulateError()
      expect(handler).toHaveBeenCalledOnce()
    })

    it('must unregister lifecycle handlers', () => {
      const MockWs = createMockWsClass()
      const client = new WsClient('ws://localhost:3000', { _WebSocket: MockWs })
      const handler = vi.fn()
      const off = client.onOpen(handler)
      off()

      lastMock().simulateOpen()
      expect(handler).not.toHaveBeenCalled()
    })
  })

  describe('send()', () => {
    it('must send fire-and-forget message', () => {
      const MockWs = createMockWsClass()
      const client = new WsClient('ws://localhost:3000', { _WebSocket: MockWs })
      lastMock().simulateOpen()

      client.send('message', '/chat/lobby', { text: 'hello' })

      const sent = JSON.parse(lastMock().sent[0])
      expect(sent).toEqual({ event: 'message', path: '/chat/lobby', data: { text: 'hello' } })
      expect(sent.id).toBeUndefined()
    })

    it('must omit data when undefined', () => {
      const MockWs = createMockWsClass()
      const client = new WsClient('ws://localhost:3000', { _WebSocket: MockWs })
      lastMock().simulateOpen()

      client.send('ping', '/health')

      const sent = JSON.parse(lastMock().sent[0])
      expect(sent).toEqual({ event: 'ping', path: '/health' })
      expect('data' in sent).toBe(false)
    })

    it('must queue send when disconnected with reconnect enabled', () => {
      const MockWs = createMockWsClass()
      const client = new WsClient('ws://localhost:3000', {
        _WebSocket: MockWs,
        reconnect: true,
      })
      // Don't open — stays in CONNECTING state

      client.send('message', '/chat/lobby', { text: 'queued' })
      expect(lastMock().sent).toHaveLength(0) // not sent yet
    })

    it('must silently drop send when disconnected without reconnect', () => {
      const MockWs = createMockWsClass()
      const client = new WsClient('ws://localhost:3000', { _WebSocket: MockWs })
      // Don't open

      client.send('message', '/chat/lobby', { text: 'dropped' })
      expect(lastMock().sent).toHaveLength(0)
    })
  })

  describe('call()', () => {
    it('must send message with correlation ID and resolve on reply', async () => {
      const MockWs = createMockWsClass()
      const client = new WsClient('ws://localhost:3000', { _WebSocket: MockWs })
      lastMock().simulateOpen()

      const promise = client.call('rpc', '/users/me')

      // Check the sent message has an ID
      const sent = JSON.parse(lastMock().sent[0])
      expect(sent.event).toBe('rpc')
      expect(sent.path).toBe('/users/me')
      expect(typeof sent.id).toBe('number')

      // Simulate server reply
      lastMock().simulateMessage(JSON.stringify({ id: sent.id, data: { name: 'Alice' } }))

      await expect(promise).resolves.toEqual({ name: 'Alice' })
    })

    it('must reject on server error reply', async () => {
      const MockWs = createMockWsClass()
      const client = new WsClient('ws://localhost:3000', { _WebSocket: MockWs })
      lastMock().simulateOpen()

      const promise = client.call('rpc', '/admin')

      const sent = JSON.parse(lastMock().sent[0])
      lastMock().simulateMessage(
        JSON.stringify({
          id: sent.id,
          error: { code: 403, message: 'Forbidden' },
        }),
      )

      await expect(promise).rejects.toThrow(WsClientError)
      await expect(promise).rejects.toMatchObject({ code: 403, message: 'Forbidden' })
    })

    it('must reject when not connected', async () => {
      const MockWs = createMockWsClass()
      const client = new WsClient('ws://localhost:3000', { _WebSocket: MockWs })
      // Don't open

      await expect(client.call('rpc', '/test')).rejects.toMatchObject({ code: 503 })
    })

    it('must reject on timeout', async () => {
      vi.useFakeTimers()
      try {
        const MockWs = createMockWsClass()
        const client = new WsClient('ws://localhost:3000', {
          _WebSocket: MockWs,
          rpcTimeout: 100,
        })
        lastMock().simulateOpen()

        const promise = client.call('rpc', '/slow')
        vi.advanceTimersByTime(100)

        await expect(promise).rejects.toMatchObject({ code: 408 })
      } finally {
        vi.useRealTimers()
      }
    })

    it('must reject pending RPCs on disconnect', async () => {
      const MockWs = createMockWsClass()
      const client = new WsClient('ws://localhost:3000', { _WebSocket: MockWs })
      lastMock().simulateOpen()

      const promise = client.call('rpc', '/test')
      lastMock().simulateClose(1006, 'Abnormal')

      await expect(promise).rejects.toMatchObject({ code: 503 })
    })
  })

  describe('on() — push listeners', () => {
    it('must dispatch push messages to exact listener', () => {
      const MockWs = createMockWsClass()
      const client = new WsClient('ws://localhost:3000', { _WebSocket: MockWs })
      lastMock().simulateOpen()

      const handler = vi.fn()
      client.on('message', '/chat/lobby', handler)

      lastMock().simulateMessage(
        JSON.stringify({
          event: 'message',
          path: '/chat/lobby',
          data: { text: 'hello' },
        }),
      )

      expect(handler).toHaveBeenCalledWith({
        event: 'message',
        path: '/chat/lobby',
        params: {},
        data: { text: 'hello' },
      })
    })

    it('must dispatch push messages to wildcard listener', () => {
      const MockWs = createMockWsClass()
      const client = new WsClient('ws://localhost:3000', { _WebSocket: MockWs })
      lastMock().simulateOpen()

      const handler = vi.fn()
      client.on('message', '/chat/*', handler)

      lastMock().simulateMessage(
        JSON.stringify({
          event: 'message',
          path: '/chat/lobby',
          params: { room: 'lobby' },
        }),
      )

      expect(handler).toHaveBeenCalledWith({
        event: 'message',
        path: '/chat/lobby',
        params: { room: 'lobby' },
        data: undefined,
      })
    })

    it('must not dispatch replies to push listeners', () => {
      const MockWs = createMockWsClass()
      const client = new WsClient('ws://localhost:3000', { _WebSocket: MockWs })
      lastMock().simulateOpen()

      const handler = vi.fn()
      client.on('message', '/chat/lobby', handler)

      // This is a reply (has `id`), not a push
      lastMock().simulateMessage(
        JSON.stringify({
          id: 1,
          data: { text: 'reply' },
        }),
      )

      expect(handler).not.toHaveBeenCalled()
    })

    it('must unregister listener', () => {
      const MockWs = createMockWsClass()
      const client = new WsClient('ws://localhost:3000', { _WebSocket: MockWs })
      lastMock().simulateOpen()

      const handler = vi.fn()
      const off = client.on('message', '/chat/lobby', handler)
      off()

      lastMock().simulateMessage(
        JSON.stringify({
          event: 'message',
          path: '/chat/lobby',
        }),
      )

      expect(handler).not.toHaveBeenCalled()
    })
  })

  describe('subscribe()', () => {
    it('must send subscribe call and return unsubscribe fn', async () => {
      const MockWs = createMockWsClass()
      const client = new WsClient('ws://localhost:3000', { _WebSocket: MockWs })
      lastMock().simulateOpen()

      const promise = client.subscribe('/chat/lobby')

      // call() sends { event: "subscribe", path: "/chat/lobby", id: N }
      const sent = JSON.parse(lastMock().sent[0])
      expect(sent.event).toBe('subscribe')
      expect(sent.path).toBe('/chat/lobby')
      expect(typeof sent.id).toBe('number')

      // Server acknowledges
      lastMock().simulateMessage(JSON.stringify({ id: sent.id, data: { joined: true } }))

      const unsub = await promise
      expect(typeof unsub).toBe('function')

      // Unsubscribe sends fire-and-forget
      unsub()
      const unsent = JSON.parse(lastMock().sent[1])
      expect(unsent).toEqual({ event: 'unsubscribe', path: '/chat/lobby' })
    })

    it('must pass data to subscribe call', async () => {
      const MockWs = createMockWsClass()
      const client = new WsClient('ws://localhost:3000', { _WebSocket: MockWs })
      lastMock().simulateOpen()

      const promise = client.subscribe('/notifications', { filter: 'urgent' })

      const sent = JSON.parse(lastMock().sent[0])
      expect(sent.data).toEqual({ filter: 'urgent' })

      lastMock().simulateMessage(JSON.stringify({ id: sent.id, data: {} }))
      await promise
    })
  })

  describe('close()', () => {
    it('must close the WebSocket and reject pending RPCs', async () => {
      const MockWs = createMockWsClass()
      const client = new WsClient('ws://localhost:3000', { _WebSocket: MockWs })
      lastMock().simulateOpen()

      const promise = client.call('rpc', '/test')
      client.close()

      await expect(promise).rejects.toMatchObject({ code: 503, message: 'Connection closed' })
    })

    it('must not reconnect after close', () => {
      vi.useFakeTimers()
      try {
        const MockWs = createMockWsClass()
        const client = new WsClient('ws://localhost:3000', {
          _WebSocket: MockWs,
          reconnect: true,
        })
        lastMock().simulateOpen()

        client.close()
        lastMock().simulateClose(1000)

        vi.advanceTimersByTime(60_000)
        expect(mockInstances).toHaveLength(1) // no new connections
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe('reconnection', () => {
    it('must reconnect after unexpected close', () => {
      vi.useFakeTimers()
      try {
        const MockWs = createMockWsClass()
        const client = new WsClient('ws://localhost:3000', {
          _WebSocket: MockWs,
          reconnect: { enabled: true, baseDelay: 100 },
        })
        lastMock().simulateOpen()
        lastMock().simulateClose(1006, 'Abnormal')

        expect(mockInstances).toHaveLength(1)
        vi.advanceTimersByTime(100) // trigger reconnect
        expect(mockInstances).toHaveLength(2)
      } finally {
        vi.useRealTimers()
      }
    })

    it('must fire onReconnect handler', () => {
      vi.useFakeTimers()
      try {
        const MockWs = createMockWsClass()
        const client = new WsClient('ws://localhost:3000', {
          _WebSocket: MockWs,
          reconnect: { enabled: true, baseDelay: 100 },
        })
        const handler = vi.fn()
        client.onReconnect(handler)

        lastMock().simulateOpen()
        lastMock().simulateClose(1006)

        vi.advanceTimersByTime(100)
        expect(handler).toHaveBeenCalledOnce()
      } finally {
        vi.useRealTimers()
      }
    })

    it('must flush queued messages on reconnect', () => {
      vi.useFakeTimers()
      try {
        const MockWs = createMockWsClass()
        const client = new WsClient('ws://localhost:3000', {
          _WebSocket: MockWs,
          reconnect: { enabled: true, baseDelay: 100 },
        })
        lastMock().simulateOpen()
        lastMock().simulateClose(1006)

        // Queue messages while disconnected
        client.send('message', '/chat/lobby', { text: 'queued1' })
        client.send('message', '/chat/lobby', { text: 'queued2' })

        // Trigger reconnect
        vi.advanceTimersByTime(100)
        const newWs = lastMock()
        expect(newWs.sent).toHaveLength(0) // not flushed yet — ws not open

        newWs.simulateOpen()
        expect(newWs.sent).toHaveLength(2) // flushed on open
      } finally {
        vi.useRealTimers()
      }
    })

    it('must resubscribe on reconnect', async () => {
      vi.useFakeTimers()
      try {
        const MockWs = createMockWsClass()
        const client = new WsClient('ws://localhost:3000', {
          _WebSocket: MockWs,
          reconnect: { enabled: true, baseDelay: 100 },
        })
        lastMock().simulateOpen()

        // Subscribe and wait for it to complete
        const subscribePromise = client.subscribe('/chat/lobby')
        const sent = JSON.parse(lastMock().sent[0])
        lastMock().simulateMessage(JSON.stringify({ id: sent.id, data: {} }))
        await subscribePromise

        // Disconnect
        lastMock().simulateClose(1006)

        // Reconnect
        vi.advanceTimersByTime(100)
        const newWs = lastMock()
        newWs.simulateOpen()

        // Should have sent a resubscribe message
        const resubscribe = newWs.sent.find((s) => {
          const msg = JSON.parse(s)
          return msg.event === 'subscribe' && msg.path === '/chat/lobby'
        })
        expect(resubscribe).toBeDefined()
      } finally {
        vi.useRealTimers()
      }
    })

    it('must not reconnect when reconnect is disabled', () => {
      vi.useFakeTimers()
      try {
        const MockWs = createMockWsClass()
        const _client = new WsClient('ws://localhost:3000', { _WebSocket: MockWs })
        lastMock().simulateOpen()
        lastMock().simulateClose(1006)

        vi.advanceTimersByTime(60_000)
        expect(mockInstances).toHaveLength(1)
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe('message parsing', () => {
    it('must ignore unparseable messages', () => {
      const MockWs = createMockWsClass()
      const client = new WsClient('ws://localhost:3000', { _WebSocket: MockWs })
      lastMock().simulateOpen()

      const handler = vi.fn()
      client.on('message', '/test', handler)

      // This won't throw — just silently dropped
      lastMock().simulateMessage('not valid json{{{')
      expect(handler).not.toHaveBeenCalled()
    })

    it('must use custom serializer and parser', async () => {
      const MockWs = createMockWsClass()
      const client = new WsClient('ws://localhost:3000', {
        _WebSocket: MockWs,
        messageSerializer: (msg) => `CUSTOM:${JSON.stringify(msg)}`,
        messageParser: (raw) => JSON.parse(raw.replace('CUSTOM:', '')),
      })
      lastMock().simulateOpen()

      client.send('test', '/path')
      expect(lastMock().sent[0]).toMatch(/^CUSTOM:/)
    })
  })
})
