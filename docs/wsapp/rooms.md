# Rooms & Broadcasting

Rooms let you group connections and broadcast messages to all members. A connection can join multiple rooms. Room names are strings — by default, the current message path is used as the room name.

[[toc]]

## Joining and Leaving

```ts
import { useWsRooms, useWsMessage } from '@wooksjs/event-ws'

ws.onMessage('join', '/chat/:room', () => {
  const { join } = useWsRooms()
  join()  // room = current path, e.g. '/chat/general'
  return { joined: true }
})

ws.onMessage('leave', '/chat/:room', () => {
  const { leave } = useWsRooms()
  leave()
  return { left: true }
})
```

### Custom room names

You can pass an explicit room name instead of using the message path:

```ts
ws.onMessage('join', '/teams/:team/channels/:channel', () => {
  const { get } = useRouteParams<{ team: string; channel: string }>()
  const { join } = useWsRooms()

  // Join a room with a custom name
  join(`team:${get('team')}:${get('channel')}`)
  return { joined: true }
})
```

### Automatic cleanup

When a connection closes, it is automatically removed from all rooms. You don't need to call `leave()` in `onDisconnect`.

### Listing rooms

```ts
const { rooms } = useWsRooms()
console.log(rooms()) // → ['/chat/general', '/chat/random']
```

## Broadcasting

### To a room (from a handler)

`useWsRooms().broadcast()` sends a push message to all members of a room, **excluding the sender** by default.

```ts
ws.onMessage('message', '/chat/:room', () => {
  const { data } = useWsMessage<{ text: string; from: string }>()
  const { broadcast } = useWsRooms()

  // Sends to all room members except the sender
  broadcast('message', data)
})
```

The broadcast uses the current message path as the room name by default. The server automatically extracts route params from the room path and includes them in the push message:

```ts
// Path pattern: /chat/:room
// Concrete path: /chat/general
// Client receives: { event: 'message', path: '/chat/general', params: { room: 'general' }, data: ... }
```

### Broadcast options

```ts
broadcast('message', data, {
  room: '/chat/random',   // override the target room (default: current message path)
  excludeSelf: false,      // include the sender in the broadcast (default: true)
})
```

### To all connections (server-wide)

Use `useWsServer().broadcast()` to send to every connected client regardless of room membership:

```ts
import { useWsServer } from '@wooksjs/event-ws'

ws.onMessage('admin', '/announce', () => {
  const { data } = useWsMessage<{ text: string }>()
  const { broadcast } = useWsServer()

  // Sends to ALL connected clients
  broadcast('announcement', '/announce', data)
  return { sent: true }
})
```

### To a specific connection

Use `useWsServer().getConnection()` to send a push message to a single connection:

```ts
const { getConnection } = useWsServer()
const conn = getConnection(targetId)
conn?.send('notification', '/private', { text: 'Hello' })
```

Or from within a handler, use `useWsConnection().send()` to push back to the current connection:

```ts
const { send } = useWsConnection()
send('notification', '/alerts', { text: 'Welcome!' })
```

## Broadcasting from onDisconnect

`useWsRooms()` is not available in `onDisconnect` because there is no message context. To notify rooms about a disconnection, read the connection's rooms manually:

```ts
ws.onDisconnect(() => {
  const { id } = useWsConnection()
  const { getConnection, roomConnections } = useWsServer()

  const connection = getConnection(id)
  if (!connection) return

  for (const room of connection.rooms) {
    for (const member of roomConnections(room)) {
      if (member.id !== id) {
        member.send('system', room, { text: `User ${id} disconnected` })
      }
    }
  }
})
```

## Room Queries

Query room membership from any handler:

```ts
import { useWsServer } from '@wooksjs/event-ws'

ws.onMessage('query', '/api/rooms', () => {
  const { roomConnections } = useWsServer()

  return {
    general: roomConnections('/chat/general').size,
    random: roomConnections('/chat/random').size,
  }
})
```

## Multi-Instance Broadcasting

By default, rooms are local to a single Node.js process. For horizontal scaling (multiple server instances behind a load balancer), provide a `WsBroadcastTransport`:

```ts
import { createWsApp } from '@wooksjs/event-ws'

const ws = createWsApp(http, {
  broadcastTransport: myRedisTransport,
})
```

The transport interface:

```ts
interface WsBroadcastTransport {
  publish(channel: string, payload: string): void | Promise<void>
  subscribe(channel: string, handler: (payload: string) => void): void | Promise<void>
  unsubscribe(channel: string): void | Promise<void>
}
```

When a transport is provided:
- `join()` subscribes to the channel `ws:room:<room-path>`
- `broadcast()` publishes to the channel; all instances receive and forward to their local connections
- `leave()` / disconnect unsubscribes when the last local connection leaves a room
