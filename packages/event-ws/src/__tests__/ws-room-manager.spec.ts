import { describe, expect, it, vi } from 'vitest'

import type { WsPushMessage, WsReplyMessage } from '../types'
import { WsConnection } from '../ws-connection'
import { WsRoomManager } from '../ws-room-manager'
import { setAdapterState } from '../composables/state'
import { useWsServer } from '../composables/server'
import { EventContext } from '@wooksjs/event-core'

function createMockConnection(
  id: string,
  serializer: (msg: WsReplyMessage | WsPushMessage) => string | Buffer = JSON.stringify,
): WsConnection {
  const sent: any[] = []
  const ws = {
    send: (data: string | Buffer) => sent.push(data),
    close: vi.fn(),
    on: vi.fn(),
    ping: vi.fn(),
    readyState: 1,
  }
  const ctx = new EventContext({ logger: console as any })
  const conn = new WsConnection(id, ws, ctx, serializer)
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
  describe('serialize once per broadcast', () => {
    function countingSerializer() {
      const fn = vi.fn((msg: WsReplyMessage | WsPushMessage) => JSON.stringify(msg))
      return fn
    }

    it('serializes a room broadcast once for all open recipients, in field order', () => {
      const ser = countingSerializer()
      const rm = new WsRoomManager()
      const conns = ['a', 'b', 'c', 'd'].map((id) => createMockConnection(id, ser))
      for (const c of conns) {
        rm.join(c, '/room')
      }
      ;(conns[3].ws as any).readyState = 3 // CLOSED

      rm.broadcast('/room', 'update', '/room', { n: 1 }, { id: '7' }, conns[0])

      expect(ser).toHaveBeenCalledTimes(1)
      expect(getSent(conns[0])).toHaveLength(0)
      expect(getSent(conns[3])).toHaveLength(0)
      expect(getSent(conns[1])).toEqual([
        '{"event":"update","path":"/room","params":{"id":"7"},"data":{"n":1}}',
      ])
      expect(getSent(conns[2])[0]).toBe(getSent(conns[1])[0])
    })

    it('does not serialize when no recipient is open', () => {
      const ser = countingSerializer()
      const rm = new WsRoomManager()
      const c1 = createMockConnection('c1', ser)
      rm.join(c1, '/room')
      ;(c1.ws as any).readyState = 2 // CLOSING
      rm.broadcast('/room', 'update', '/room', { n: 1 })
      expect(ser).not.toHaveBeenCalled()
    })

    it('serializes once per distinct serializer', () => {
      const s1 = countingSerializer()
      const s2 = vi.fn((msg: WsReplyMessage | WsPushMessage) => `s2:${JSON.stringify(msg)}`)
      const rm = new WsRoomManager()
      const conns = [
        createMockConnection('a', s1),
        createMockConnection('b', s1),
        createMockConnection('c', s2),
      ]
      for (const c of conns) {
        rm.join(c, '/room')
      }
      rm.broadcast('/room', 'e', '/room')
      expect(s1).toHaveBeenCalledTimes(1)
      expect(s2).toHaveBeenCalledTimes(1)
      expect(getSent(conns[0])).toEqual(['{"event":"e","path":"/room"}'])
      expect(getSent(conns[2])).toEqual(['s2:{"event":"e","path":"/room"}'])
    })

    it('serializes transport-delivered broadcasts once and honours excludeId', () => {
      const handlers = new Map<string, (payload: string) => void>()
      const transport = {
        publish: vi.fn(),
        subscribe: (channel: string, handler: (payload: string) => void) => {
          handlers.set(channel, handler)
        },
        unsubscribe: vi.fn(),
      }
      const ser = countingSerializer()
      const rm = new WsRoomManager(transport)
      const conns = ['a', 'b', 'c'].map((id) => createMockConnection(id, ser))
      for (const c of conns) {
        rm.join(c, '/room')
      }
      handlers.get('ws:room:/room')!(
        JSON.stringify({ event: 'm', path: '/room', data: 1, excludeId: 'b' }),
      )
      expect(ser).toHaveBeenCalledTimes(1)
      expect(getSent(conns[0])).toEqual(['{"event":"m","path":"/room","data":1}'])
      expect(getSent(conns[1])).toHaveLength(0)
      expect(getSent(conns[2])).toEqual(['{"event":"m","path":"/room","data":1}'])
    })

    it('useWsServer().broadcast serializes once for all open connections', () => {
      const ser = countingSerializer()
      const conns = ['a', 'b', 'c'].map((id) => createMockConnection(id, ser))
      ;(conns[1].ws as any).readyState = 3
      setAdapterState({
        connections: new Map(conns.map((c) => [c.id, c])),
        roomManager: new WsRoomManager(),
        serializer: ser,
        wooks: {} as any,
      })
      useWsServer().broadcast('tick', '/clock', 5)
      expect(ser).toHaveBeenCalledTimes(1)
      expect(getSent(conns[0])).toEqual(['{"event":"tick","path":"/clock","data":5}'])
      expect(getSent(conns[1])).toHaveLength(0)
      expect(getSent(conns[2])).toEqual(['{"event":"tick","path":"/clock","data":5}'])
    })

    it('sendSerialized sends the payload as is and skips closed sockets', () => {
      const c1 = createMockConnection('c1')
      c1.sendSerialized('raw')
      ;(c1.ws as any).readyState = 3
      c1.sendSerialized('dropped')
      expect(getSent(c1)).toEqual(['raw'])
    })
  })
})
