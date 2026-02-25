# Core concepts & setup — @wooksjs/ws-client

> WebSocket client with RPC, subscriptions, reconnection, and push listeners — designed to pair with `@wooksjs/event-ws`.

## Concepts

`@wooksjs/ws-client` is a standalone WebSocket client (no dependency on `@wooksjs/event-core`) that speaks the same JSON wire protocol as `@wooksjs/event-ws`. It provides:

- **Fire-and-forget messaging** via `send()`
- **RPC (request-response)** via `call()` with correlation IDs and timeouts
- **Subscriptions** via `subscribe()` with auto-resubscribe on reconnect
- **Push listeners** via `on()` with exact and wildcard path matching
- **Auto-reconnection** with configurable backoff
- **Message queuing** when disconnected (with reconnect enabled)

### Wire protocol

The client sends `WsClientMessage` and receives either `WsReplyMessage` (for RPC) or `WsPushMessage` (for push/broadcast):

```ts
// Client → Server
interface WsClientMessage {
  event: string // e.g. "message", "rpc", "subscribe"
  path: string // e.g. "/chat/rooms/lobby"
  data?: unknown
  id?: number // auto-generated for call(), triggers a reply
}

// Server → Client (reply)
interface WsReplyMessage {
  id: string | number
  data?: unknown
  error?: { code: number; message: string }
}

// Server → Client (push)
interface WsPushMessage {
  event: string
  path: string
  params?: Record<string, string>
  data?: unknown
}
```

## Installation / Setup

```bash
pnpm add @wooksjs/ws-client
```

The client uses the native `WebSocket` API (available in browsers and Node.js >= 22). For Node.js < 22, install the `ws` package — it's an optional peer dependency.

## API Reference

### `createWsClient(url, options?)`

Factory function. Creates and immediately connects a `WsClient`.

```ts
const client = createWsClient('wss://api.example.com/ws', {
  reconnect: true,
  rpcTimeout: 5000,
})
```

### `WsClientOptions`

```ts
interface WsClientOptions {
  protocols?: string | string[] // WebSocket sub-protocols
  reconnect?: boolean | WsClientReconnectOptions // default: disabled
  rpcTimeout?: number // ms (default: 10000)
  messageParser?: (raw: string) => WsReplyMessage | WsPushMessage
  messageSerializer?: (msg: WsClientMessage) => string
  _WebSocket?: WebSocketConstructor // @internal — for testing
}
```

### `WsClient` class

#### `client.send(event, path, data?)`

Fire-and-forget message. Queued when disconnected if reconnect is enabled.

```ts
client.send('message', '/chat/rooms/lobby', { text: 'hello' })
```

#### `client.call<T>(event, path, data?): Promise<T>`

RPC call. Auto-generates a correlation ID. Rejects with `WsClientError` on timeout, server error, or disconnect.

```ts
const user = await client.call<User>('rpc', '/users/me')
```

#### `client.subscribe(path, data?): Promise<() => void>`

Subscribe to a server path. Sends a `subscribe` event via RPC, stores the subscription for auto-resubscribe on reconnect. Returns an unsubscribe function.

```ts
const unsub = await client.subscribe('/chat/rooms/lobby')
// later:
unsub() // sends "unsubscribe" event
```

#### `client.on<T>(event, pathPattern, handler): () => void`

Register a client-side push listener. Supports exact paths and wildcard (`*`) suffix. Returns an unregister function.

```ts
const off = client.on<{ text: string }>('message', '/chat/rooms/*', ({ data, path }) => {
  console.log(`${path}: ${data.text}`)
})
```

#### `client.close()`

Close the connection. Disables reconnect. Rejects all pending RPCs. Clears the message queue.

#### Lifecycle events

```ts
client.onOpen(() => console.log('Connected'))
client.onClose((code, reason) => console.log(`Closed: ${code}`))
client.onError((event) => console.error('Error:', event))
client.onReconnect((attempt) => console.log(`Reconnecting #${attempt}`))
```

All lifecycle methods return an unregister function.

### `WsClientError`

Error class with a numeric `code`. Thrown/rejected by `call()` and `subscribe()`.

Common codes:

- `408` — RPC timeout
- `503` — Not connected / connection lost / connection closed
- Server error codes (e.g., `404`, `403`, `500`) from `WsReplyMessage.error`

```ts
try {
  await client.call('rpc', '/protected')
} catch (err) {
  if (err instanceof WsClientError && err.code === 403) {
    console.log('Forbidden')
  }
}
```

## Common Patterns

### Pattern: Basic chat client

```ts
const client = createWsClient('wss://api.example.com/ws', { reconnect: true })

// Listen for messages
client.on<{ text: string }>('message', '/chat/rooms/*', ({ data, path }) => {
  console.log(`[${path}] ${data.text}`)
})

// Subscribe to a room
await client.subscribe('/chat/rooms/lobby')

// Send a message
client.send('message', '/chat/rooms/lobby', { text: 'Hello everyone!' })
```

### Pattern: RPC calls

```ts
const client = createWsClient('wss://api.example.com/ws')

const user = await client.call<{ name: string }>('rpc', '/users/me')
console.log(user.name)
```

### Pattern: Custom serializer

```ts
const client = createWsClient('wss://api.example.com/ws', {
  messageSerializer: (msg) => JSON.stringify(msg),
  messageParser: (raw) => JSON.parse(raw),
})
```

## Best Practices

- Always enable `reconnect` for production clients — network interruptions are inevitable
- Set `rpcTimeout` appropriate for your use case (default: 10s)
- Use typed generics with `call<T>()` and `on<T>()` for type-safe payloads
- Store the unsubscribe/unregister functions returned by `subscribe()`, `on()`, `onOpen()`, etc. to prevent leaks
- Call `client.close()` when the client is no longer needed

## Gotchas

- `call()` rejects immediately with code 503 if the socket is not open — it does NOT queue like `send()`
- `send()` only queues when disconnected if `reconnect` is enabled; otherwise the message is silently dropped
- The client connects immediately on construction — there is no `connect()` method
- For Node.js < 22 without the `ws` package, the constructor throws `TypeError`
- Subscriptions are auto-resubscribed on reconnect, but failures are silently swallowed — the next reconnect will retry
