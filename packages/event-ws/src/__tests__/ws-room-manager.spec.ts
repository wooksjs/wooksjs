import { describe, expect, it, vi } from 'vitest'

import type { WsPushMessage, WsReplyMessage } from '../types'
import { WsConnection } from '../ws-connection'
import { WsRoomManager } from '../ws-room-manager'
import { EventContext } from '@wooksjs/event-core'

function createMockConnection(id: string): WsConnection {
  const sent: any[] = []
  const ws = {
    send: (data: string | Buffer) => sent.push(data),
    close: vi.fn(),
    on: vi.fn(),
    ping: vi.fn(),
    readyState: 1,
  }
  const ctx = new EventContext({ logger: console as any })
  const conn = new WsConnection(id, ws, ctx, JSON.stringify)
  ;(conn as any)._sent = sent
  return conn
}

function getSent(conn: WsConnection): any[] {
  return (conn as any)._sent
}

describe('WsRoomManager', () => {
  it('must join and leave rooms', () => {
    const rm = new WsRoomManager()
    const conn = createMockConnection('c1')

    rm.join(conn, '/chat/lobby')
    expect(conn.rooms.has('/chat/lobby')).toBe(true)
    expect(rm.connections('/chat/lobby').size).toBe(1)

    rm.leave(conn, '/chat/lobby')
    expect(conn.rooms.has('/chat/lobby')).toBe(false)
    expect(rm.connections('/chat/lobby').size).toBe(0)
  })

  it('must clean up empty rooms', () => {
    const rm = new WsRoomManager()
    const conn = createMockConnection('c1')

    rm.join(conn, '/room')
    rm.leave(conn, '/room')

    // Internal state: the room should be deleted from the map
    expect(rm.connections('/room').size).toBe(0)
  })

  it('must leaveAll on disconnect', () => {
    const rm = new WsRoomManager()
    const conn = createMockConnection('c1')

    rm.join(conn, '/a')
    rm.join(conn, '/b')
    rm.join(conn, '/c')

    rm.leaveAll(conn)

    expect(conn.rooms.size).toBe(0)
    expect(rm.connections('/a').size).toBe(0)
    expect(rm.connections('/b').size).toBe(0)
    expect(rm.connections('/c').size).toBe(0)
  })

  it('must broadcast to room connections', () => {
    const rm = new WsRoomManager()
    const c1 = createMockConnection('c1')
    const c2 = createMockConnection('c2')
    const c3 = createMockConnection('c3')

    rm.join(c1, '/room')
    rm.join(c2, '/room')
    rm.join(c3, '/room')

    rm.broadcast('/room', 'update', '/room', { text: 'hello' }, undefined, c1)

    // c1 excluded, c2 and c3 receive
    expect(getSent(c1)).toHaveLength(0)
    expect(getSent(c2)).toHaveLength(1)
    expect(getSent(c3)).toHaveLength(1)

    const msg = JSON.parse(getSent(c2)[0])
    expect(msg.event).toBe('update')
    expect(msg.path).toBe('/room')
    expect(msg.data).toEqual({ text: 'hello' })
  })

  it('must broadcast to all when no exclude', () => {
    const rm = new WsRoomManager()
    const c1 = createMockConnection('c1')
    const c2 = createMockConnection('c2')

    rm.join(c1, '/room')
    rm.join(c2, '/room')

    rm.broadcast('/room', 'ping', '/room')

    expect(getSent(c1)).toHaveLength(1)
    expect(getSent(c2)).toHaveLength(1)
  })

  it('must return empty set for non-existent room', () => {
    const rm = new WsRoomManager()
    expect(rm.connections('/nonexistent').size).toBe(0)
  })
})
