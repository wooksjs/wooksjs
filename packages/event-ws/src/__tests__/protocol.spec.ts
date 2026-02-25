import { describe, expect, it, vi } from 'vitest'

import { WsConnection } from '../ws-connection'
import { EventContext } from '@wooksjs/event-core'

function createTestConnection(serializer = JSON.stringify) {
  const sent: string[] = []
  const ws = {
    send: (data: string | Buffer) => sent.push(data.toString()),
    close: vi.fn(),
    on: vi.fn(),
    ping: vi.fn(),
    readyState: 1, // OPEN
  }
  const ctx = new EventContext({ logger: console as any })
  const conn = new WsConnection('test-id', ws, ctx, serializer)
  return { conn, sent, ws }
}

describe('WsConnection protocol', () => {
  describe('send() — push messages', () => {
    it('must serialize push message with event, path, data', () => {
      const { conn, sent } = createTestConnection()
      conn.send('update', '/chat/lobby', { text: 'hello' })

      expect(sent).toHaveLength(1)
      const msg = JSON.parse(sent[0])
      expect(msg).toEqual({
        event: 'update',
        path: '/chat/lobby',
        data: { text: 'hello' },
      })
    })

    it('must include params when provided', () => {
      const { conn, sent } = createTestConnection()
      conn.send('update', '/chat/rooms/lobby', { text: 'hi' }, { roomId: 'lobby' })

      const msg = JSON.parse(sent[0])
      expect(msg.params).toEqual({ roomId: 'lobby' })
    })

    it('must omit data and params when undefined', () => {
      const { conn, sent } = createTestConnection()
      conn.send('ping', '/health')

      const msg = JSON.parse(sent[0])
      expect(msg).toEqual({ event: 'ping', path: '/health' })
      expect('data' in msg).toBe(false)
      expect('params' in msg).toBe(false)
    })

    it('must not send when readyState is not OPEN', () => {
      const { conn, sent, ws } = createTestConnection()
      ;(ws as any).readyState = 3 // CLOSED
      conn.send('update', '/path', 'data')
      expect(sent).toHaveLength(0)
    })
  })

  describe('reply() — request-response', () => {
    it('must serialize reply with id and data', () => {
      const { conn, sent } = createTestConnection()
      conn.reply(42, { result: 'ok' })

      const msg = JSON.parse(sent[0])
      expect(msg).toEqual({ id: 42, data: { result: 'ok' } })
    })

    it('must send reply with null data when undefined', () => {
      const { conn, sent } = createTestConnection()
      conn.reply(1)

      const msg = JSON.parse(sent[0])
      expect(msg).toEqual({ id: 1 })
      expect('data' in msg).toBe(false)
    })
  })

  describe('replyError()', () => {
    it('must serialize error reply', () => {
      const { conn, sent } = createTestConnection()
      conn.replyError(7, 403, 'Forbidden')

      const msg = JSON.parse(sent[0])
      expect(msg).toEqual({
        id: 7,
        error: { code: 403, message: 'Forbidden' },
      })
    })
  })

  describe('close()', () => {
    it('must delegate to ws.close', () => {
      const { conn, ws } = createTestConnection()
      conn.close(1008, 'Policy violation')
      expect(ws.close).toHaveBeenCalledWith(1008, 'Policy violation')
    })
  })
})
