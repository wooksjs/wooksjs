# Core concepts & setup — @wooksjs/event-ws

> WebSocket adapter for Wooks: creates a WS server, routes messages by event+path, manages connections, and supports standalone or HTTP-integrated modes.

## Concepts

`@wooksjs/event-ws` follows the Wooks adapter pattern. It creates two nested context layers:

1. **Connection context** (`ws:connection` kind) — long-lived, one per connected client. Seeded with `id` and `ws` socket.
2. **Message context** (`ws:message` kind) — short-lived, one per incoming message. Its `parent` is the connection context.

Messages follow a JSON wire protocol with `event` + `path` for routing and an optional `id` for request-response correlation.

### Wire protocol

**Client → Server (`WsClientMessage`):**

```ts
interface WsClientMessage {
  event: string // router method (e.g. "message", "rpc", "subscribe")
  path: string // route path (e.g. "/chat/rooms/lobby")
  data?: unknown // payload
  id?: string | number // correlation ID — triggers a reply
}
```

**Server → Client reply (`WsReplyMessage`):**

```ts
interface WsReplyMessage {
  id: string | number // matches the client's id
  data?: unknown // handler return value
  error?: { code: number; message: string }
}
```

**Server → Client push (`WsPushMessage`):**

```ts
interface WsPushMessage {
  event: string
  path: string
  params?: Record<string, string>
  data?: unknown
}
```

## Installation / Setup

```bash
pnpm add @wooksjs/event-ws wooks @wooksjs/event-core ws
```

`ws` is a peer dependency (the default WebSocket server implementation). You can substitute it with a custom `WsServerAdapter`.

## API Reference

### `createWsApp(wooksOrOpts?, opts?)`

Factory that creates a `WooksWs` instance.

- `wooksOrOpts` — a `Wooks` or `WooksAdapterBase` instance (HTTP integration), or `TWooksWsOptions` (standalone)
- `opts` — `TWooksWsOptions` when the first arg is a Wooks instance

Returns: `WooksWs`

### `TWooksWsOptions`

```ts
interface TWooksWsOptions {
  heartbeatInterval?: number // ping interval in ms (default: 30000, 0 = disabled)
  heartbeatTimeout?: number // pong timeout in ms (default: 5000)
  messageParser?: (raw: Buffer | string) => WsClientMessage
  messageSerializer?: (msg: WsReplyMessage | WsPushMessage) => string | Buffer
  logger?: TConsoleBase
  maxMessageSize?: number // bytes (default: 1MB), oversized messages are dropped
  wsServerAdapter?: WsServerAdapter // custom WS engine (default: wraps `ws`)
  broadcastTransport?: WsBroadcastTransport // for multi-instance
}
```

### `WooksWs` class

Extends `WooksAdapterBase`, implements `WooksUpgradeHandler`.

#### `ws.onMessage(event, path, handler)`

Register a routed message handler. Uses the Wooks router — supports path params.

```ts
ws.onMessage('message', '/chat/rooms/:roomId', () => {
  const { data } = useWsMessage<{ text: string }>()
  const { params } = useRouteParams()
  // ...
})
```

#### `ws.onConnect(handler)`

Register a handler that runs when a new WebSocket connection is established. Runs inside the connection context. Throwing or rejecting closes the connection.

```ts
ws.onConnect(() => {
  const { id } = useWsConnection()
  console.log('Connected:', id)
})
```

#### `ws.onDisconnect(handler)`

Register a handler that runs when a connection closes.

#### `ws.upgrade()`

Complete the WebSocket handshake from inside an HTTP UPGRADE route handler. Reads `req`/`socket`/`head` from the current HTTP context. The HTTP context becomes the parent of the WS connection context.

#### `ws.handleUpgrade(req, socket, head)`

Fallback for when no UPGRADE route matches (called by the HTTP adapter automatically).

#### `ws.listen(port, hostname?)`

Start a standalone server (without `event-http`). Returns a `Promise<void>`.

#### `ws.close()`

Stop the server, close all connections, clean up heartbeat.

#### `ws.getServer()`

Returns the underlying `http.Server` (standalone mode only).

### `WsError`

Error class with a numeric `code` following HTTP conventions. Throwing `WsError` in a handler sends an error reply to the client.

```ts
throw new WsError(403, 'Forbidden')
```

### `WsSocket` interface

Minimal WebSocket instance interface — compatible with `ws`, uWebSockets.js, and Bun.

### `WsServerAdapter` interface

Factory for creating a custom WebSocket server:

```ts
interface WsServerAdapter {
  create(): WsServerInstance
}
```

## Common Patterns

### Pattern: HTTP-integrated mode (recommended)

```ts
import { createHttpApp } from '@wooksjs/event-http'
import { createWsApp } from '@wooksjs/event-ws'

const http = createHttpApp()
const ws = createWsApp(http) // auto-registers upgrade contract

http.upgrade('/ws', () => ws.upgrade())

ws.onMessage('message', '/chat/rooms/:roomId', () => {
  const { data } = useWsMessage<{ text: string }>()
  return { ok: true }
})

http.listen(3000)
```

### Pattern: Standalone mode

```ts
import { createWsApp } from '@wooksjs/event-ws'

const ws = createWsApp({ heartbeatInterval: 30_000 })

ws.onMessage('rpc', '/users/:id', () => {
  const { data } = useWsMessage()
  const { params } = useRouteParams()
  return { userId: params.id }
})

ws.listen(3000)
```

### Pattern: Connection authentication

```ts
ws.onConnect(() => {
  // Access HTTP context if using HTTP-integrated mode
  // Throw to reject the connection
  const token = getTokenFromSomewhere()
  if (!isValid(token)) {
    throw new WsError(401, 'Unauthorized')
  }
})
```

### Pattern: Custom serializer (e.g. MessagePack)

```ts
import { encode, decode } from '@msgpack/msgpack'

const ws = createWsApp({
  messageParser: (raw) => decode(raw as Buffer) as WsClientMessage,
  messageSerializer: (msg) => Buffer.from(encode(msg)),
})
```

## Best Practices

- Use HTTP-integrated mode for production — it shares the HTTP server and handles UPGRADE routing cleanly
- Set `maxMessageSize` appropriate for your use case to prevent memory abuse
- Use `WsError` with HTTP-style codes for structured error replies
- Keep `onConnect` handlers fast — they block connection acceptance
- Heartbeat is enabled by default (30s); set to 0 only for short-lived connections

## Gotchas

- Handler return values are only sent as replies when the client message included an `id` field. Fire-and-forget messages (no `id`) get no reply even if the handler returns a value.
- The `ws` package is a peer dependency — you must install it explicitly.
- `useWsRooms()` and `useWsMessage()` are only available in message context (inside `onMessage` handlers), not in `onConnect`/`onDisconnect`.
- When a connection context has an HTTP parent (integrated mode), composables from `@wooksjs/event-http` can read HTTP headers/cookies via the parent chain.
