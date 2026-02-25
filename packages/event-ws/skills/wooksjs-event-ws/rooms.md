# Rooms & broadcasting — @wooksjs/event-ws

> Room-based connection grouping, local and cross-instance broadcasting, and the broadcast transport interface.

## Concepts

Rooms are named groups of connections. A connection can join multiple rooms. Broadcasting sends a push message to all connections in a room, optionally excluding the sender.

The room system has two layers:

1. **Local** — `WsRoomManager` tracks `Map<string, Set<WsConnection>>` in memory
2. **Distributed** — optional `WsBroadcastTransport` for cross-instance pub/sub (e.g., Redis)

When a message is broadcast:

1. Local connections in the room receive it directly
2. If a transport is configured, the message is published to `ws:room:{roomName}` for other instances
3. Other instances receive it via the transport subscription and forward to their local connections

## API Reference

### `WsRoomManager`

Internal class that manages room → connections mapping. Not typically used directly — use `useWsRooms()` composable instead.

```ts
class WsRoomManager {
  join(connection: WsConnection, room: string): void
  leave(connection: WsConnection, room: string): void
  leaveAll(connection: WsConnection): void // called automatically on disconnect
  connections(room: string): Set<WsConnection>
  broadcast(room, event, path, data?, params?, exclude?): void
}
```

### `WsBroadcastTransport` interface

Pluggable transport for cross-instance broadcasting:

```ts
interface WsBroadcastTransport {
  publish(channel: string, payload: string): void | Promise<void>
  subscribe(channel: string, handler: (payload: string) => void): void | Promise<void>
  unsubscribe(channel: string): void | Promise<void>
}
```

Channels follow the pattern `ws:room:{roomName}`. The payload is a JSON-stringified object containing `{ event, path, data, params, excludeId }`.

### `useWsRooms()` composable

See [composables.md](composables.md) for full API. The composable provides `join()`, `leave()`, `broadcast()`, and `rooms()` scoped to the current connection and message path.

## Common Patterns

### Pattern: Chat rooms

```ts
ws.onMessage('subscribe', '/chat/rooms/:roomId', () => {
  const { join } = useWsRooms()
  join() // joins room = "/chat/rooms/:roomId" (resolved path)
  return { subscribed: true }
})

ws.onMessage('unsubscribe', '/chat/rooms/:roomId', () => {
  const { leave } = useWsRooms()
  leave()
  return { unsubscribed: true }
})

ws.onMessage('message', '/chat/rooms/:roomId', () => {
  const { data } = useWsMessage<{ text: string }>()
  const { broadcast } = useWsRooms()
  broadcast('message', data) // excludes sender by default
  return { sent: true }
})
```

### Pattern: Redis broadcast transport

```ts
import Redis from 'ioredis'

const pub = new Redis()
const sub = new Redis()
const handlers = new Map<string, (payload: string) => void>()

const redisTransport: WsBroadcastTransport = {
  publish(channel, payload) {
    pub.publish(channel, payload)
  },
  subscribe(channel, handler) {
    handlers.set(channel, handler)
    sub.subscribe(channel)
  },
  unsubscribe(channel) {
    handlers.delete(channel)
    sub.unsubscribe(channel)
  },
}

sub.on('message', (channel, payload) => {
  handlers.get(channel)?.(payload)
})

const ws = createWsApp({ broadcastTransport: redisTransport })
```

### Pattern: Server-wide broadcast (no rooms)

```ts
const { broadcast } = useWsServer()
broadcast('announcement', '/system/alert', { message: 'Server restarting' })
```

### Pattern: Broadcast to a specific room from outside message context

```ts
// From a different handler (e.g., HTTP endpoint)
const { roomConnections } = useWsServer()
const connections = roomConnections('/chat/rooms/lobby')
for (const conn of connections) {
  conn.send('notification', '/chat/rooms/lobby', { text: 'New event!' })
}
```

## Best Practices

- Room names default to the message path — this is the most natural mapping (subscribe to `/chat/rooms/lobby` → join room `/chat/rooms/lobby`)
- Use `excludeSelf: true` (default) for chat-style broadcasts where the sender already has their own confirmation
- Implement `WsBroadcastTransport` for horizontal scaling — without it, broadcasts only reach connections on the same instance
- Connections are automatically removed from all rooms on disconnect (`leaveAll` is called internally)

## Gotchas

- The transport channel format is `ws:room:{roomName}` — make sure your Redis/NATS key patterns don't conflict
- Transport messages include `excludeId` to prevent echo on the originating instance, but the exclude only works by connection ID — if the same user has multiple connections, other connections will still receive the broadcast
- Empty rooms are automatically cleaned up (removed from the internal Map)
- `useWsRooms()` is only available in message context — you cannot join/leave rooms from `onConnect`/`onDisconnect`
