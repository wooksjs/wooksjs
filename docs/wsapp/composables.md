# WebSocket Composables

::: warning Experimental
This package is in an experimental phase. The API may change without following semver until it reaches a stable release.
:::

Composables for working with WebSocket connections, messages, rooms, and server state. Most composables follow the Wooks `defineWook` pattern — results are cached per context and resolved lazily; `useWsServer()` is a plain function.

[[toc]]

## useWsConnection

Returns connection-level information. Available in both connection handlers (`onConnect`, `onDisconnect`) and message handlers (`onMessage`).

```ts
import { useWsConnection } from '@wooksjs/event-ws'

ws.onMessage('query', '/me', () => {
  const { id, send, close } = useWsConnection()
  return { connectionId: id }
})
```

| Property | Type | Description |
|----------|------|-------------|
| `id` | `string` | Unique connection ID (`crypto.randomUUID()`) |
| `send` | `(event, path, data?, params?) => void` | Send a push message directly to this connection |
| `close` | `(code?, reason?) => void` | Close the underlying WebSocket |
| `context` | `EventContext` | The connection-level event context |

### Direct push to a connection

```ts
const { send } = useWsConnection()

// Send a push message to this specific connection
send('notification', '/alerts', { text: 'New message' })

// With route params (received by client in the push event)
send('update', '/users/42', { name: 'Alice' }, { id: '42' })
```

Push messages bypass room membership — they go directly to the connection regardless of which rooms it has joined.

### currentConnection()

A lower-level escape hatch that returns the connection-level `EventContext` from either handler type — `current()` in `onConnect`/`onDisconnect`, or `current().parent` (the connection context) in `onMessage`. Most code should use `useWsConnection()` instead; reach for `currentConnection()` only when you need the raw context to read/write connection-scoped slots directly.

```ts
import { currentConnection } from '@wooksjs/event-ws'

const connCtx = currentConnection() // connection EventContext, from any WS handler
```

## useWsMessage

Returns the current message payload and metadata. Available **only** in message handlers (`onMessage`).

```ts
import { useWsMessage } from '@wooksjs/event-ws'

ws.onMessage('message', '/chat/:room', () => {
  const { data, raw, id, path, event } = useWsMessage<{ text: string }>()

  console.log(event) // → 'message'
  console.log(path)  // → '/chat/general'
  console.log(data)  // → { text: 'hello' }

  return { received: true }
})
```

| Property | Type | Description |
|----------|------|-------------|
| `data` | `T` | Parsed message payload (generic type parameter) |
| `raw` | `Buffer \| string` | Raw message before parsing |
| `id` | `string \| number \| undefined` | Correlation ID — present when client used `call()` |
| `path` | `string` | Concrete message path (e.g. `/chat/general`) |
| `event` | `string` | Event type (e.g. `message`, `join`, `subscribe`) |

### Handler return values

What your handler returns determines the server's response:

| Situation | Server behavior |
|-----------|----------------|
| Client sent `id`, handler returns value | Reply: `{ id, data: <value> }` |
| Client sent `id`, handler returns `undefined` | Reply: `{ id, data: null }` |
| Client sent no `id` (fire-and-forget) | Return value is ignored |
| Handler throws `WsError` | Reply: `{ id, error: { code, message } }` (if `id` present) |
| Handler throws other `Error` | Reply: `{ id, error: { code: 500, message: "Internal Error" } }` |

## useWsRooms

Room management and broadcasting. Available **only** in message handlers (`onMessage`). All methods default to the current message path as the room name.

```ts
import { useWsRooms } from '@wooksjs/event-ws'

ws.onMessage('join', '/chat/:room', () => {
  const { join, broadcast, rooms } = useWsRooms()

  join()  // joins room = current path (/chat/general)
  broadcast('system', { text: 'Someone joined' })

  return { rooms: rooms() }
})
```

| Method | Signature | Description |
|--------|-----------|-------------|
| `join` | `(room?: string) => void` | Join a room. Defaults to current message path. |
| `leave` | `(room?: string) => void` | Leave a room. Defaults to current message path. |
| `broadcast` | `(event, data?, options?) => void` | Broadcast to all connections in a room. |
| `rooms` | `() => string[]` | List all rooms this connection has joined. |

See [Rooms & Broadcasting](/wsapp/rooms) for a detailed guide.

## useWsServer

Server-wide state: all connections, global broadcast, room queries. Available anywhere — including outside event contexts — once a `WooksWs` adapter has been constructed; it throws `[event-ws] No active WooksWs adapter` otherwise. With multiple `WooksWs` instances in one process, it reads the most recently constructed one.

```ts
import { useWsServer } from '@wooksjs/event-ws'

ws.onMessage('admin', '/broadcast', () => {
  const { broadcast, connections } = useWsServer()

  // Send to ALL connected clients
  broadcast('announcement', '/system', { text: 'Server restarting' })

  return { totalConnections: connections().size }
})
```

| Method | Signature | Description |
|--------|-----------|-------------|
| `connections` | `() => Map<string, WsConnection>` | All active connections |
| `broadcast` | `(event, path, data?, params?) => void` | Send to ALL connected clients |
| `getConnection` | `(id: string) => WsConnection \| undefined` | Look up a specific connection |
| `roomConnections` | `(room: string) => Set<WsConnection>` | All connections in a room |

### Difference from useWsRooms().broadcast

- `useWsServer().broadcast()` sends to **all** connected clients regardless of room membership.
- `useWsRooms().broadcast()` sends only to members of a specific room, excluding the sender by default.

### Accessing connections directly

```ts
const { getConnection, roomConnections } = useWsServer()

// Send to a specific connection by ID
const conn = getConnection('some-connection-id')
conn?.send('notification', '/private', { text: 'Just for you' })

// Iterate members of a room
for (const conn of roomConnections('/chat/general')) {
  console.log(conn.id, conn.rooms)
}
```

## useRouteParams

Route parameters work the same as in HTTP. Available in message handlers when the path pattern contains parameters.

```ts
import { useRouteParams } from '@wooksjs/event-ws'

ws.onMessage('message', '/chat/:room', () => {
  const { get } = useRouteParams<{ room: string }>()
  const room = get('room') // → 'general'
})
```

This is re-exported from `@wooksjs/event-core` for convenience.

## HTTP Composables in WebSocket

When a connection starts as an HTTP upgrade request, the original request data is accessible through the parent context chain. HTTP composables resolve transparently:

::: warning Integrated mode only
HTTP composables are available only when the connection went through an UPGRADE route that calls `ws.upgrade()` (integrated mode with `@wooksjs/event-http`). In standalone mode (`ws.listen()`), there is no HTTP upgrade context and these composables throw.
:::

```ts
import { useHeaders, useCookies, useAuthorization } from '@wooksjs/event-http'

ws.onConnect(() => {
  // All of these read from the original upgrade request
  const { headers } = useHeaders()
  const { getCookie } = useCookies()
  const { is, basicCredentials } = useAuthorization()

  if (!is('bearer')) {
    throw new WsError(401, 'Authentication required')
  }
})

ws.onMessage('query', '/me', () => {
  // Also works in message handlers — resolved through parent chain
  const { headers } = useHeaders()
  return { userAgent: headers['user-agent'] }
})
```

| HTTP Composable | Works in WS (integrated mode)? | Notes |
|----------------|-------------|-------|
| `useRequest()` | Yes | Returns the upgrade `IncomingMessage` |
| `useHeaders()` | Yes | Upgrade request headers |
| `useCookies()` | Yes | Cookies from the upgrade request |
| `useAuthorization()` | Yes | Auth header from the upgrade request |
| `useUrlParams()` | Yes | Query string from the upgrade URL |
| `useAccept()` | Yes | Accept header from the upgrade request |
| `useResponse()` | No | No HTTP response exists in WebSocket context |
| `useBody()` | No | Upgrade requests have no body |

## WsError

Throw `WsError` to send structured error responses to the client.

```ts
import { WsError } from '@wooksjs/event-ws'

ws.onMessage('join', '/chat/:room', () => {
  const { data } = useWsMessage<{ name: string }>()
  if (!data?.name) {
    throw new WsError(400, 'Name is required')
  }
  if (isNameTaken(data.name)) {
    throw new WsError(409, 'Name already taken')
  }
  // ...
})
```

| Context | Behavior |
|---------|---------|
| `onMessage` with `id` | Sends `{ id, error: { code, message } }` |
| `onMessage` without `id` | Nothing sent; `WsError` is silently swallowed (only non-`WsError` exceptions are logged) |
| `onConnect` | Rejects the connection (close code 1008 for 401/403, 1011 for others) |

## Connection Lifecycle

### onConnect

Runs when a new WebSocket connection is established. Use it for authentication, session setup, or logging.

```ts
ws.onConnect(() => {
  const { id } = useWsConnection()
  const { getCookie } = useCookies()
  console.log(`New connection: ${id}`)

  // Reject unauthenticated connections
  if (!getCookie('session')) {
    throw new WsError(401, 'Not authenticated')
  }
})
```

### onDisconnect

Runs when a connection closes. Use it for cleanup. Room membership is cleaned up automatically — you don't need to call `leave()` here.

```ts
ws.onDisconnect(() => {
  const { id } = useWsConnection()
  console.log(`Disconnected: ${id}`)
  // Custom cleanup: remove from state maps, notify other users, etc.
})
```

::: warning
`useWsRooms()` is **not available** in `onDisconnect` — it requires a message context. If you need to notify rooms about a disconnection, use `useWsServer().getConnection(id)` to read the connection's `rooms` set and send messages manually.
:::

### Heartbeat

In standalone mode, the server sends periodic `ping` frames to detect dead connections. A connection that has not answered the previous ping with a `pong` by the next tick is closed with WS code `1001` (Heartbeat timeout) — the pong window equals `heartbeatInterval`.

```ts
const ws = createWsApp({
  heartbeatInterval: 30000, // ms between pings (default: 30000)
})
await ws.listen(3000)
```

Set `heartbeatInterval: 0` to disable heartbeat.

::: warning
Heartbeat runs only in standalone mode (`ws.listen()`). When `@wooksjs/event-ws` is integrated with an HTTP server via `createWsApp(http)` + `ws.upgrade()`, no heartbeat pings are sent — implement your own liveness checks if you need dead-connection reaping in integrated mode.
:::

## Server Options

All options accepted by `createWsApp()` — pass them as the only argument in standalone mode, or as the second argument after the HTTP app in integrated mode:

| Option | Default | Description |
|--------|---------|-------------|
| `heartbeatInterval` | `30000` | Ms between heartbeat pings (standalone mode only). `0` disables. |
| `messageParser` | `JSON.parse` | Custom deserializer for incoming messages. See [Custom Serialization](/wsapp/protocol#custom-serialization). |
| `messageSerializer` | `JSON.stringify` | Custom serializer for outgoing messages. See [Custom Serialization](/wsapp/protocol#custom-serialization). |
| `maxMessageSize` | 1 MB | Incoming messages exceeding this size are silently dropped. |
| `wsServerAdapter` | wraps `ws` | Plug-in point for alternative WS engines (e.g. uWebSockets.js, Bun). An object implementing `WsServerAdapter` (`create(): WsServerInstance`); the default wraps the `ws` package in `noServer` mode. |
| `broadcastTransport` | local only | Cross-instance broadcast transport. See [Multi-Instance Broadcasting](/wsapp/rooms#multi-instance-broadcasting). |
| `logger` | built-in | Logger instance. See [Logging](/wsapp/logging). |
