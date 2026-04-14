# @wooksjs/event-ws -- API Reference

WebSocket adapter for Wooks. Path-based message routing, connection management, rooms, and broadcasting.

## Table of Contents

- [Context Layers](#context-layers) -- connection vs message context
- [Wire Protocol](#wire-protocol) -- WsClientMessage, WsReplyMessage, WsPushMessage
- [App Setup](#app-setup) -- createWsApp, TWooksWsOptions
- [WooksWs Class](#wooksws-class) -- onMessage, onConnect, onDisconnect, upgrade, handleUpgrade, listen, close
- [WsError](#wserror)
- [Composables](#composables) -- useWsConnection, useWsMessage, useWsRooms, useWsServer, currentConnection
- [Rooms & Broadcasting](#rooms--broadcasting) -- WsRoomManager, WsBroadcastTransport
- [Patterns](#patterns) -- HTTP-integrated, standalone, auth, chat rooms, Redis transport, custom serializer
- [Testing](#testing) -- prepareTestWsConnectionContext, prepareTestWsMessageContext
- [Best Practices](#best-practices)
- [Gotchas](#gotchas)

---

## Context Layers

The adapter creates two nested `EventContext` layers per connection:

1. **Connection context** (`ws:connection` kind) -- long-lived, one per connected client. Seeded with `id` (UUID) and `ws` (WsSocket). Created via `createWsConnectionContext`.
2. **Message context** (`ws:message` kind) -- short-lived, one per incoming message. Parent is the connection context. Created via `createWsMessageContext`.

Context availability by handler type:

| Handler         | Connection ctx | Message ctx |
|-----------------|:--------------:|:-----------:|
| `onConnect`     | yes            | no          |
| `onDisconnect`  | yes            | no          |
| `onMessage`     | yes (parent)   | yes         |

When using HTTP-integrated mode, the HTTP context becomes the parent of the connection context, enabling composables from `@wooksjs/event-http` to traverse the parent chain (e.g., read HTTP headers/cookies).

### Event Kinds

```ts
const wsConnectionKind = defineEventKind('ws:connection', {
  id: slot<string>(),
  ws: slot<WsSocket>(),
})

const wsMessageKind = defineEventKind('ws:message', {
  data: slot<unknown>(),
  rawMessage: slot<Buffer | string>(),
  messageId: slot<string | number | undefined>(),
  messagePath: slot<string>(),
  messageEvent: slot<string>(),
})
```

---

## Wire Protocol

Three message types define the client-server protocol. This is the canonical definition -- `ws-client.md` references these types.

### WsClientMessage (client -> server)

```ts
interface WsClientMessage {
  event: string           // router method (e.g. "message", "rpc", "subscribe")
  path: string            // route path (e.g. "/chat/rooms/lobby")
  data?: unknown          // payload
  id?: string | number    // correlation ID -- triggers a reply when present
}
```

### WsReplyMessage (server -> client reply)

```ts
interface WsReplyMessage {
  id: string | number                        // matches the client's id
  data?: unknown                             // handler return value
  error?: { code: number; message: string }  // mutually exclusive with data
}
```

### WsPushMessage (server -> client push)

```ts
interface WsPushMessage {
  event: string                       // event type
  path: string                        // concrete path
  params?: Record<string, string>     // route params extracted by server router
  data?: unknown                      // payload
}
```

---

## App Setup

### `createWsApp(wooksOrOpts?, opts?)`

Factory that creates a `WooksWs` instance.

- `wooksOrOpts` -- a `Wooks` or `WooksAdapterBase` instance (HTTP integration), or `TWooksWsOptions` (standalone)
- `opts` -- `TWooksWsOptions` when the first arg is a Wooks instance

Returns: `WooksWs`

```ts
// HTTP-integrated (recommended)
const http = createHttpApp()
const ws = createWsApp(http)

// Standalone
const ws = createWsApp({ heartbeatInterval: 30_000 })
```

### TWooksWsOptions

```ts
interface TWooksWsOptions {
  heartbeatInterval?: number       // ping interval ms (default: 30000, 0 = disabled)
  heartbeatTimeout?: number        // pong timeout ms (default: 5000)
  messageParser?: (raw: Buffer | string) => WsClientMessage
  messageSerializer?: (msg: WsReplyMessage | WsPushMessage) => string | Buffer
  logger?: TConsoleBase
  maxMessageSize?: number          // bytes (default: 1MB), oversized silently dropped
  wsServerAdapter?: WsServerAdapter
  broadcastTransport?: WsBroadcastTransport
}
```

### WsSocket / WsServerAdapter

`WsSocket` is a minimal WebSocket interface compatible with `ws`, uWebSockets.js, and Bun. Methods: `send(data)`, `close(code?, reason?)`, `on('message'|'close'|'error'|'pong', handler)`, `ping()`, `readonly readyState`.

`WsServerAdapter` is a factory (`{ create(): WsServerInstance }`) for custom WS engine integration. `WsServerInstance` provides `handleUpgrade(req, socket, head, cb)` and `close()`.

---

## WooksWs Class

Extends `WooksAdapterBase`, implements `WooksUpgradeHandler`.

### `ws.onMessage(event, path, handler)`

Register a routed message handler. Supports path params via the Wooks router.

```ts
ws.onMessage('message', '/chat/rooms/:roomId', () => {
  const { data } = useWsMessage<{ text: string }>()
  return { ok: true }
})
```

Signature: `onMessage<ResType, ParamsType>(event: string, path: string, handler: TWooksHandler<ResType>)`

### `ws.onConnect(handler)` / `ws.onDisconnect(handler)`

Register handlers for connection lifecycle. Both run inside the connection context. Throwing or rejecting in `onConnect` closes the connection immediately.

### `ws.upgrade()`

Complete the WebSocket handshake from inside an HTTP UPGRADE route handler. Reads `req`/`socket`/`head` from the current HTTP context. The HTTP context becomes the parent of the WS connection context. Usage: `http.upgrade('/ws', () => ws.upgrade())`

### `ws.handleUpgrade(req, socket, head)`

Fallback for when no UPGRADE route matches. Called by the HTTP adapter automatically. Signature: `handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void`

### `ws.listen(port, hostname?)` / `ws.close()` / `ws.getServer()`

`listen` starts a standalone server (without `event-http`), returns `Promise<void>`, starts heartbeat automatically. `close` stops the server, closes all connections (code 1001), cleans up heartbeat. `getServer` returns the underlying `http.Server` (standalone mode) or `undefined`.

---

## WsError

Error class with a numeric `code` following HTTP conventions. Throw in any handler to send a structured error reply.

```ts
class WsError extends Error {
  constructor(readonly code: number, message?: string)
}

// Usage
throw new WsError(403, 'Forbidden')
throw new WsError(404, 'Not found')
```

When thrown in `onConnect`, the connection is rejected with WebSocket close code:
- 401/403 -> close code 1008 (Policy Violation)
- Other -> close code 1011 (Internal Error)

When thrown in `onMessage`, the error is sent as a `WsReplyMessage` (only if the client message had an `id`).

---

## Composables

### `useWsConnection(ctx?)`

Access the current WebSocket connection. Works in both connection and message contexts (traverses parent chain).

```ts
{
  id: string                                          // unique connection ID (UUID)
  send(event: string, path: string, data?: unknown,
       params?: Record<string, string>): void         // push message to this client
  close(code?: number, reason?: string): void         // close the connection
  context: EventContext                                // the connection EventContext
}
```

### `useWsMessage<T>(ctx?)`

Access the current message. **Only available in message context** (`onMessage` handlers).

```ts
{
  data: T                              // parsed message data (generic typed)
  raw: Buffer | string                 // raw message before parsing
  id: string | number | undefined      // correlation ID (undefined = fire-and-forget)
  path: string                         // message path
  event: string                        // message event type
}
```

### `useWsRooms(ctx?)`

Room management scoped to the current connection and message path. **Only available in message context.**

```ts
{
  join(room?: string): void             // default: current message path
  leave(room?: string): void            // default: current message path
  broadcast(event: string, data?: unknown, options?: WsBroadcastOptions): void
  rooms(): string[]                     // rooms this connection has joined
}
```

```ts
interface WsBroadcastOptions {
  room?: string          // target room (default: current message path)
  excludeSelf?: boolean  // exclude sender (default: true)
}
```

### `useWsServer()`

Server-wide operations. **Not a `defineWook`** -- reads from module-level adapter state. Works anywhere (not scoped to a context).

```ts
{
  connections(): Map<string, WsConnection>
  broadcast(event: string, path: string, data?: unknown, params?: Record<string, string>): void
  getConnection(id: string): WsConnection | undefined
  roomConnections(room: string): Set<WsConnection>
}
```

### `currentConnection(ctx?)`

Returns the connection `EventContext` regardless of handler type. In `onConnect`/`onDisconnect`: returns `current()` directly. In `onMessage`: returns `current().parent` (the connection context).

### Re-exports from @wooksjs/event-core

`useRouteParams` and `useLogger` are re-exported for convenience. See `event-core.md` for full API.

---

## Rooms & Broadcasting

### WsRoomManager

Internal class managing `Map<string, Set<WsConnection>>`. Use `useWsRooms()` composable in handlers. Direct use only needed for advanced scenarios.

```ts
class WsRoomManager {
  join(connection: WsConnection, room: string): void
  leave(connection: WsConnection, room: string): void
  leaveAll(connection: WsConnection): void       // called automatically on disconnect
  connections(room: string): Set<WsConnection>
  broadcast(room: string, event: string, path: string,
            data?: unknown, params?: Record<string, string>,
            exclude?: WsConnection): void
}
```

Constructor accepts an optional `WsBroadcastTransport` for cross-instance pub/sub.

### WsBroadcastTransport

Pluggable transport for multi-instance broadcasting:

```ts
interface WsBroadcastTransport {
  publish(channel: string, payload: string): void | Promise<void>
  subscribe(channel: string, handler: (payload: string) => void): void | Promise<void>
  unsubscribe(channel: string): void | Promise<void>
}
```

Broadcast flow:
1. Local connections in the room receive the message directly
2. If a transport is configured, the message is published to channel `ws:room:{roomName}`
3. Other instances receive it via transport subscription and forward to their local connections

Transport payload format (JSON-stringified):

```ts
{ event: string, path: string, data?: unknown, params?: Record<string, string>, excludeId?: string }
```

### WsConnection (internal)

```ts
class WsConnection {
  readonly id: string
  readonly ws: WsSocket
  readonly ctx: EventContext
  readonly rooms: Set<string>
  alive: boolean

  send(event: string, path: string, data?: unknown, params?: Record<string, string>): void
  reply(id: string | number, data?: unknown): void
  replyError(id: string | number, code: number, message: string): void
  close(code?: number, reason?: string): void
}
```

`send`/`reply`/`replyError` silently drop if `ws.readyState !== 1` (not OPEN).

---

## Patterns

### HTTP-integrated mode (recommended)

```ts
const http = createHttpApp()
const ws = createWsApp(http)
http.upgrade('/ws', () => ws.upgrade())

ws.onConnect(() => {
  // HTTP parent context accessible -- read headers/cookies for auth
  const token = getTokenFromSomewhere()
  if (!isValid(token)) throw new WsError(401, 'Unauthorized')
})

ws.onMessage('message', '/chat/rooms/:roomId', () => {
  const { data } = useWsMessage<{ text: string }>()
  return { ok: true }
})

http.listen(3000)
```

### Standalone mode

```ts
const ws = createWsApp({ heartbeatInterval: 30_000 })
ws.onMessage('rpc', '/users/:id', () => {
  const { params } = useRouteParams()
  return { userId: params.id }
})
ws.listen(3000)
```

### Chat rooms (subscribe/unsubscribe/broadcast)

```ts
ws.onMessage('subscribe', '/chat/rooms/:roomId', () => { useWsRooms().join(); return { subscribed: true } })
ws.onMessage('unsubscribe', '/chat/rooms/:roomId', () => { useWsRooms().leave(); return { unsubscribed: true } })
ws.onMessage('message', '/chat/rooms/:roomId', () => {
  const { data } = useWsMessage<{ text: string }>()
  useWsRooms().broadcast('message', data)  // excludes sender by default
  return { sent: true }
})
```

### Redis broadcast transport

```ts
const pub = new Redis(), sub = new Redis()
const handlers = new Map<string, (payload: string) => void>()

const redisTransport: WsBroadcastTransport = {
  publish: (ch, payload) => { pub.publish(ch, payload) },
  subscribe: (ch, handler) => { handlers.set(ch, handler); sub.subscribe(ch) },
  unsubscribe: (ch) => { handlers.delete(ch); sub.unsubscribe(ch) },
}
sub.on('message', (ch, payload) => { handlers.get(ch)?.(payload) })

const ws = createWsApp({ broadcastTransport: redisTransport })
```

### Custom serializer (e.g. MessagePack)

```ts
const ws = createWsApp({
  messageParser: (raw) => decode(raw as Buffer) as WsClientMessage,
  messageSerializer: (msg) => Buffer.from(encode(msg)),
})
```

### Broadcast from outside message context

```ts
const { roomConnections } = useWsServer()
for (const conn of roomConnections('/chat/rooms/lobby')) {
  conn.send('notification', '/chat/rooms/lobby', { text: 'New event!' })
}
```

---

## Testing

Import test helpers from `@wooksjs/event-ws`.

### `prepareTestWsConnectionContext(options?)`

Create a connection context with a mock `WsSocket`. Returns a runner function `<T>(cb: (...a: any[]) => T) => T`.

```ts
interface TTestWsConnectionContext {
  id?: string                                    // default: 'test-conn-id'
  params?: Record<string, string | string[]>     // pre-set route params
  parentCtx?: EventContext                        // optional parent (e.g. HTTP context)
}
```

```ts
import { prepareTestWsConnectionContext, useWsConnection } from '@wooksjs/event-ws'

const runInCtx = prepareTestWsConnectionContext({ id: 'conn-1' })

runInCtx(() => {
  const { id } = useWsConnection()
  expect(id).toBe('conn-1')
})
```

### `prepareTestWsMessageContext(options)`

Create a message context with a parent connection context. Both contexts are fully seeded. Returns a runner function.

```ts
interface TTestWsMessageContext extends TTestWsConnectionContext {
  event: string                      // required
  path: string                       // required
  data?: unknown
  messageId?: string | number
  rawMessage?: Buffer | string       // default: JSON.stringify of the message
}
```

```ts
import { prepareTestWsMessageContext, useWsMessage } from '@wooksjs/event-ws'

const runInCtx = prepareTestWsMessageContext({
  event: 'message',
  path: '/chat/lobby',
  data: { text: 'hello' },
  messageId: 42,
})

runInCtx(() => {
  const { data, id, path } = useWsMessage<{ text: string }>()
  expect(data.text).toBe('hello')
  expect(id).toBe(42)
  expect(path).toBe('/chat/lobby')
})
```

### Testing with adapter state

Composables that access adapter state (`useWsConnection`, `useWsRooms`, `useWsServer`) require initialization. `setAdapterState` is internal -- import from source in tests:

```ts
import { setAdapterState } from '@wooksjs/event-ws/composables/state'
setAdapterState({ connections: new Map(), roomManager: new WsRoomManager(), serializer: JSON.stringify, wooks: {} as any })
```

### Testing with HTTP parent / route params

Pass `parentCtx` to simulate HTTP-integrated mode. Pass `params` to pre-set route params:

```ts
const httpCtx = new EventContext({ logger: console as any })
const runInCtx = prepareTestWsMessageContext({
  event: 'message', path: '/chat/rooms/lobby',
  params: { roomId: 'lobby' }, parentCtx: httpCtx,
})
runInCtx(() => {
  expect(currentConnection().parent).toBe(httpCtx)
  expect(useRouteParams().params.roomId).toBe('lobby')
})
```

---

## Best Practices

- Use HTTP-integrated mode for production -- shares the HTTP server and handles UPGRADE routing cleanly
- Set `maxMessageSize` appropriate for the use case to prevent memory abuse
- Use `WsError` with HTTP-style codes for structured error replies; keep `onConnect` handlers fast (they block connection acceptance)
- Heartbeat is enabled by default (30s); set to 0 only for short-lived connections
- Always type `useWsMessage<T>()` with the expected payload type
- Call `useWsRooms()` without arguments to default to the current message path; prefer `useWsServer().broadcast()` for server-wide announcements vs `useWsRooms().broadcast()` for room-scoped messages
- Implement `WsBroadcastTransport` for horizontal scaling -- without it, broadcasts only reach the same process
- Always use test helpers (`prepareTestWs*Context`) rather than manually constructing `EventContext` -- they ensure proper kind seeding
- The mock `WsSocket` has no-op methods -- to assert on sent messages, create a custom mock and use `WsConnection` directly

---

## Gotchas

- Handler return values are only sent as replies when the client message included an `id` field. Fire-and-forget messages (no `id`) produce no reply even if the handler returns a value.
- The `ws` package is a peer dependency -- install it explicitly.
- `useWsMessage()` and `useWsRooms()` throw if called outside a message context (e.g. inside `onConnect` or `onDisconnect`).
- When a connection context has an HTTP parent (integrated mode), composables from `@wooksjs/event-http` can read HTTP headers/cookies via the parent chain -- this is by design, not a leak.
- `useWsServer()` is not a `defineWook` -- it reads from module-level adapter state, so it works anywhere but requires the adapter to be initialized first.
- `useWsConnection().send()` silently drops messages if the socket is not in OPEN state (`readyState !== 1`).
- The transport channel format is `ws:room:{roomName}` -- ensure Redis/NATS key patterns do not conflict.
- Transport messages include `excludeId` to prevent echo on the originating instance, but the exclude is by connection ID -- if the same user has multiple connections, other connections still receive the broadcast.
- Empty rooms are automatically cleaned up (removed from the internal Map).
- `prepareTestWsMessageContext` requires `event` and `path` -- they are not optional.
- Test contexts use `console` as the logger -- there is no direct override; wrap with a custom `EventContext` if needed.
- The mock socket's `readyState` is `1` (OPEN) by default -- `send()` calls pass the guard check in tests.
- When `onConnect` throws or rejects, the connection is rejected with WS close code 1008 (for 401/403) or 1011 (other errors).
- Messages exceeding `maxMessageSize` (default 1MB) are silently dropped with no error reply.
- Messages that fail to parse (invalid JSON, missing `event`/`path`) are silently dropped.
