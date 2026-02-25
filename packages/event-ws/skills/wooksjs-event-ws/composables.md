# Composables — @wooksjs/event-ws

> Composable functions for accessing WebSocket connection, message, room, and server state inside handlers.

## Concepts

All composables follow the Wooks `defineWook` pattern — they read from the current `EventContext` via `AsyncLocalStorage`. They are only valid inside handler functions registered with `onMessage`, `onConnect`, or `onDisconnect`.

The WS adapter creates two context levels:

- **Connection context** — available in `onConnect`, `onDisconnect`, and `onMessage` (via parent chain)
- **Message context** — only available in `onMessage` handlers

## API Reference

### `useWsConnection(ctx?)`

Access the current WebSocket connection. Works in both connection and message contexts.

Returns:

```ts
{
  id: string                    // unique connection ID (UUID)
  send(event, path, data?, params?): void  // push a message to this client
  close(code?, reason?): void   // close the connection
  context: EventContext          // the connection EventContext
}
```

```ts
ws.onMessage('message', '/chat/:room', () => {
  const { id, send } = useWsConnection()
  send('ack', '/chat/lobby', { received: true })
})
```

### `useWsMessage<T>(ctx?)`

Access the current WebSocket message data. **Only available in message context** (inside `onMessage` handlers).

Returns:

```ts
{
  data: T // parsed message data (generic typed)
  raw: Buffer | string // raw message before parsing
  id: string | number | undefined // correlation ID
  path: string // message path
  event: string // message event type
}
```

```ts
ws.onMessage('message', '/chat/:room', () => {
  const { data, id, path } = useWsMessage<{ text: string }>()
  console.log(data.text) // typed as string
})
```

### `useWsRooms(ctx?)`

Room management for the current connection. **Only available in message context.** Defaults to the current message path as the room name.

Returns:

```ts
{
  join(room?): void              // join a room (default: current message path)
  leave(room?): void             // leave a room (default: current message path)
  broadcast(event, data?, options?): void  // broadcast to a room
  rooms(): string[]              // list rooms this connection has joined
}
```

`WsBroadcastOptions`:

```ts
{
  room?: string          // target room (default: current message path)
  excludeSelf?: boolean  // exclude sender (default: true)
}
```

```ts
ws.onMessage('subscribe', '/chat/rooms/:roomId', () => {
  const { join } = useWsRooms()
  join() // joins the room matching the current path
})

ws.onMessage('message', '/chat/rooms/:roomId', () => {
  const { data } = useWsMessage<{ text: string }>()
  const { broadcast } = useWsRooms()
  broadcast('message', data) // sends to all in room except sender
})
```

### `useWsServer()`

Server-wide operations. Available in any context (not scoped to a specific connection). Reads directly from adapter state, not from `EventContext`.

Returns:

```ts
{
  connections(): Map<string, WsConnection>         // all active connections
  broadcast(event, path, data?, params?): void     // broadcast to ALL connections
  getConnection(id: string): WsConnection | undefined
  roomConnections(room: string): Set<WsConnection> // connections in a room
}
```

```ts
ws.onMessage('rpc', '/admin/broadcast', () => {
  const { data } = useWsMessage<{ text: string }>()
  const { broadcast } = useWsServer()
  broadcast('announcement', '/system', data)
})
```

### `currentConnection(ctx?)`

Returns the connection `EventContext` regardless of whether you're in a connection or message handler.

- In `onConnect`/`onDisconnect`: returns `current()` directly
- In `onMessage`: returns `current().parent` (the connection context)

```ts
const connCtx = currentConnection()
```

### Re-exports from `@wooksjs/event-core`

These are re-exported for convenience:

- `useRouteParams(ctx?)` — access path params from the Wooks router
- `useLogger(ctx?)` — access the scoped logger

```ts
ws.onMessage('rpc', '/users/:id', () => {
  const { params } = useRouteParams()
  return { userId: params.id }
})
```

## Best Practices

- Always type `useWsMessage<T>()` with your expected payload type for type safety
- Use `useWsRooms()` without arguments to default to the current message path as the room — this is the most common pattern
- Prefer `useWsServer().broadcast()` for server-wide announcements, `useWsRooms().broadcast()` for room-scoped messages
- The `context` property from `useWsConnection()` gives access to the raw `EventContext` for advanced use (e.g., reading custom context keys set during `onConnect`)

## Gotchas

- `useWsMessage()` and `useWsRooms()` throw if called outside a message context (e.g., inside `onConnect`)
- `useWsServer()` is not a `defineWook` — it reads from module-level adapter state, so it works anywhere but requires the adapter to be initialized
- `useWsConnection().send()` silently drops messages if the socket is not in OPEN state (readyState !== 1)
