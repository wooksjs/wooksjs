# @wooksjs/event-ws -- API Reference

WebSocket adapter for Wooks. Path-based message routing, connection management, rooms, and broadcasting.

Key imports (everything ships from the package root — no subpath exports):

```ts
import {
  createWsApp, WooksWs, WsError, WsRoomManager,
  useWsConnection, useWsMessage, useWsRooms, useWsServer, currentConnection,
  prepareTestWsConnectionContext, prepareTestWsMessageContext,
} from '@wooksjs/event-ws'
```

## Contents

- [Context Layers](#context-layers) — connection vs message context
- [Wire Protocol](#wire-protocol) — `WsClientMessage`, `WsReplyMessage`, `WsPushMessage`
- [App Setup](#app-setup) — `createWsApp`, `TWooksWsOptions`
- [WooksWs Class](#wooksws-class) — `onMessage`, `onConnect`, `onDisconnect`, `upgrade`, `handleUpgrade`, `listen`, `close`
- [WsError](#wserror)
- [Composables](#composables) — `useWsConnection`, `useWsMessage`, `useWsRooms`, `useWsServer`, `currentConnection`
- [Rooms & Broadcasting](#rooms--broadcasting) — `WsRoomManager`, `WsBroadcastTransport`, `WsConnection`
- [Patterns](#patterns) — HTTP-integrated, standalone, chat rooms, Redis transport, custom serializer
- [Testing](#testing) — `prepareTestWsConnectionContext`, `prepareTestWsMessageContext`
- [Rules & Gotchas](#rules--gotchas)
- [See Also](#see-also)

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

| Kind            | Seeded slots                                                                                          |
|-----------------|-------------------------------------------------------------------------------------------------------|
| `ws:connection` | `id` (UUID string), `ws` (`WsSocket`)                                                                  |
| `ws:message`    | `data` (unknown), `rawMessage` (Buffer/string), `messageId` (string/number/undefined), `messagePath`, `messageEvent` |

`wsConnectionKind` / `wsMessageKind` are exported from `@wooksjs/event-ws` for advanced slot access.

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

| Option               | Default                | Effect                                                                          |
|----------------------|------------------------|----------------------------------------------------------------------------------|
| `heartbeatInterval`  | `30000`                | ping interval ms; `0` disables. Standalone `listen()` mode only.                 |
| `heartbeatTimeout`   | —                      | declared but currently unused — liveness is checked at the next `heartbeatInterval` tick |
| `messageParser`      | JSON parse + shape check | `(raw: Buffer \| string) => WsClientMessage`                                   |
| `messageSerializer`  | `JSON.stringify`       | `(msg: WsReplyMessage \| WsPushMessage) => string \| Buffer`                     |
| `logger`             | built-in logger        | `TConsoleBase`                                                                   |
| `maxMessageSize`     | 1 MB                   | oversized messages silently dropped                                              |
| `wsServerAdapter`    | `ws`-based default     | custom WS engine factory (see below)                                             |
| `broadcastTransport` | —                      | cross-instance pub/sub (see [Rooms & Broadcasting](#rooms--broadcasting))        |

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

Each accepts exactly ONE handler — calling `onConnect`/`onDisconnect` again replaces the previous handler (last registration wins). Compose multiple concerns (auth + metrics + ...) inside a single handler.

### `ws.upgrade()`

Complete the WebSocket handshake from inside an HTTP UPGRADE route handler. Reads `req`/`socket`/`head` from the current HTTP context. The HTTP context becomes the parent of the WS connection context. Usage: `http.upgrade('/ws', () => ws.upgrade())`

### `ws.handleUpgrade(req, socket, head)`

Fallback for when no UPGRADE route matches. Called by the HTTP adapter automatically. Signature: `handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void`

### `ws.listen(port, hostname?)` / `ws.close()` / `ws.getServer()`

`listen` starts a standalone server (without `event-http`), returns `Promise<void>`, starts heartbeat automatically. `close` stops the heartbeat, closes the WS server and all connections (code 1001 "Server shutting down"); it does NOT close the `http.Server` created by `listen()` — call `ws.getServer()?.close()` to release the port. `getServer` returns the underlying `http.Server` (standalone mode) or `undefined`.

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

`broadcast()` reaches connections on the current instance only — it does not use `broadcastTransport`. For cross-instance delivery use room broadcasts via `useWsRooms().broadcast()` (the adapter's room manager applies `broadcastTransport`; it is not directly exposed).

### `currentConnection(ctx?)`

Returns `ctx.parent ?? ctx` (`ctx` defaults to `current()`). In `onMessage` this is the connection context. In `onConnect`/`onDisconnect` under HTTP-integrated mode it returns the HTTP parent context — use `current()` directly there when you need the connection context. `useWsConnection().context` is computed via `currentConnection`, so it behaves identically (NOT a workaround in `onConnect`/`onDisconnect`).

### Re-exports from @wooksjs/event-core

`useRouteParams` and `useLogger` are re-exported for convenience. See `event-core.md` for full API.

---

## Rooms & Broadcasting

### WsRoomManager

Internal — use `useWsRooms()` in handlers. Constructor accepts optional `WsBroadcastTransport` for cross-instance pub/sub; empty rooms auto-cleaned; `leaveAll` on disconnect is automatic.

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

Obtained via `useWsServer().getConnection(id)` / `roomConnections(room)`. Methods: `send(event, path, data?, params?)`, `reply(id, data?)`, `replyError(id, code, message)`, `close(code?, reason?)`. Fields: `id`, `ws`, `ctx`, `rooms`, `alive`. Send methods silently drop if `ws.readyState !== 1` (not OPEN).

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

| Option      | Default          | Effect                                       |
|-------------|------------------|----------------------------------------------|
| `id`        | `'test-conn-id'` | connection ID                                |
| `params`    | —                | pre-set route params                         |
| `parentCtx` | —                | parent context (e.g. an HTTP test context)   |

```ts
import { createWsApp, prepareTestWsConnectionContext, useWsConnection } from '@wooksjs/event-ws'

createWsApp({}) // once in test setup — useWsConnection reads adapter state

const runInCtx = prepareTestWsConnectionContext({ id: 'conn-1' })

runInCtx(() => {
  const { id } = useWsConnection()
  expect(id).toBe('conn-1')
})
```

### `prepareTestWsMessageContext(options)`

Create a message context with a parent connection context. Both contexts are fully seeded. Returns a runner function. Accepts all `prepareTestWsConnectionContext` options plus:

| Option       | Default                       | Effect                                  |
|--------------|-------------------------------|------------------------------------------|
| `event`      | required                      | message event type                       |
| `path`       | required                      | message path                             |
| `data`       | —                             | parsed message data                      |
| `messageId`  | —                             | correlation ID                           |
| `rawMessage` | `JSON.stringify` of the message | raw message before parsing             |

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

Composables that read adapter state (`useWsConnection`, `useWsRooms`, `useWsServer`) require a constructed adapter — call `createWsApp({})` once in test setup (the `WooksWs` constructor publishes the adapter state singleton):

```ts
import { createWsApp } from '@wooksjs/event-ws'

beforeAll(() => { createWsApp({}) })
```

### Testing with HTTP parent / route params

Pass `parentCtx` to simulate HTTP-integrated mode — build it with `prepareTestHttpContext` from `@wooksjs/event-http`. Pass `params` to pre-set route params:

```ts
import { current } from '@wooksjs/event-core'
import { prepareTestHttpContext } from '@wooksjs/event-http'

const httpCtx = prepareTestHttpContext({ url: '/ws' })(() => current())
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

## Rules & Gotchas

| #  | Invariant |
|----|-----------|
| 1  | Handler return value is sent as a reply only if the client message had `id`. Fire-and-forget messages get no reply. |
| 2  | Unmatched event/path: error reply `{ code: 404, message: 'Not found' }` if the message has an `id`; silently dropped otherwise. |
| 3  | A non-`WsError` throw from a handler replies `{ code: 500, message: 'Internal Error' }` (when `id` present) and is logged; `WsError` code/message pass through verbatim. |
| 4  | `useWsMessage()` / `useWsRooms()` throw outside message context (e.g. in `onConnect`/`onDisconnect`). |
| 5  | `useWsServer()` is NOT a `defineWook` — works anywhere, but throws until a `WooksWs` adapter has been constructed. |
| 6  | `useWsServer().broadcast()` reaches connections on the current instance only — it does not use `broadcastTransport`. For cross-instance delivery use room broadcasts via `useWsRooms().broadcast()` (the adapter's room manager applies `broadcastTransport`; it is not directly exposed). |
| 7  | `useWsConnection().send()` silently drops when `ws.readyState !== 1`. |
| 8  | HTTP-integrated mode: connection context's parent is HTTP context, so HTTP composables (headers/cookies) work in WS handlers — by design. |
| 9  | `onConnect`/`onDisconnect` each hold exactly ONE handler — a second registration silently replaces the first. |
| 10 | `WsError` in `onConnect`: 401/403 → WS close code 1008; others → 1011. |
| 11 | Messages exceeding `maxMessageSize` (default 1MB) and invalid JSON are silently dropped (no error reply). |
| 12 | Heartbeat runs only in standalone `listen()` mode — it is NOT started in HTTP-integrated mode (`createWsApp(http)` + `http.upgrade`); stale connections are not pinged/closed there. |
| 13 | Heartbeat interval defaults to 30s; set to 0 to disable. `heartbeatTimeout` has no effect — dead connections are closed (1001 "Heartbeat timeout") on the next interval tick. |
| 14 | `ws.close()` does NOT close the `http.Server` created by `listen()` — call `ws.getServer()?.close()` to release the port. |
| 15 | Transport channel format: `ws:room:{roomName}`. `excludeId` is per-connection — same user on multiple sockets will still get the broadcast on other sockets. |
| 16 | Empty rooms auto-cleaned; `leaveAll` on disconnect is automatic. |
| 17 | The `ws` package is a peer dependency — install explicitly. |
| 18 | Typing: always pass `T` to `useWsMessage<T>()`. |
| 19 | Implement `WsBroadcastTransport` for multi-instance broadcasting. |

Testing:

| # | Invariant |
|---|-----------|
| 1 | Use `prepareTestWs*Context` helpers — do not construct `EventContext` manually. Build an HTTP parent with `prepareTestHttpContext` from `@wooksjs/event-http`. |
| 2 | `prepareTestWsMessageContext` requires `event` and `path`. |
| 3 | Mock `WsSocket` has `readyState = 1` (OPEN) and no-op methods. For assertions on sent messages, wire a custom mock. |
| 4 | Test contexts use `console` as the logger — no direct override. |
| 5 | Composables that read adapter state (`useWsConnection`, `useWsRooms`, `useWsServer`) need `createWsApp({})` called once in test setup. |

---

## See Also

| Ref | Covers |
|-----|--------|
| [ws-client.md](ws-client.md) | client counterpart — `createWsClient`, RPC, reconnection, push listeners |
| [event-http.md](event-http.md) | HTTP adapter — `http.upgrade` routes, `prepareTestHttpContext` |
| [event-core.md](event-core.md) | `EventContext`, `current()`, `useRouteParams`, `useLogger` |
