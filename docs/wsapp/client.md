# Client Guide

`@wooksjs/ws-client` is a structured WebSocket client for browsers and Node.js. It provides RPC calls with automatic correlation, fire-and-forget messaging, push listeners with path matching, subscriptions with auto-resubscribe, and reconnection with backoff.

Zero runtime dependencies. Uses native `WebSocket` in browsers.

[[toc]]

## Installation

```bash
npm install @wooksjs/ws-client
```

For Node.js, also install the `ws` package:

```bash
npm install @wooksjs/ws-client ws
```

## Creating a Client

### Browser

```ts
import { createWsClient } from '@wooksjs/ws-client'

const client = createWsClient('ws://localhost:3000/ws', {
  reconnect: true,
  rpcTimeout: 5000,
})
```

### Node.js

```ts
import WebSocket from 'ws'
import { createWsClient } from '@wooksjs/ws-client'

const client = createWsClient('ws://localhost:3000/ws', {
  _WebSocket: WebSocket as any,
  rpcTimeout: 5000,
})
```

### Options

```ts
interface WsClientOptions {
  protocols?: string | string[]                // WebSocket subprotocols
  reconnect?: boolean | WsClientReconnectOptions  // Enable reconnection
  rpcTimeout?: number                          // Timeout for call() in ms (default: 10000)
  messageParser?: (raw: string) => any         // Custom deserializer (default: JSON.parse)
  messageSerializer?: (msg: any) => string     // Custom serializer (default: JSON.stringify)
  _WebSocket?: typeof WebSocket               // WebSocket constructor override (Node.js)
}
```

## Sending Messages

### Fire-and-forget: `send()`

Send a message without expecting a reply. The server handler's return value is ignored.

```ts
client.send('message', '/chat/general', { text: 'Hello!' })
```

Wire frame: `{ event: "message", path: "/chat/general", data: { text: "Hello!" } }`

When disconnected with reconnect enabled, messages are **queued** and sent when the connection reopens. Without reconnect, they are silently dropped.

### RPC: `call()`

Send a message and wait for the server's reply. Returns a typed Promise.

```ts
const result = await client.call<{ joined: boolean }>('join', '/chat/general', { name: 'Alice' })
console.log(result.joined) // → true
```

Wire frame: `{ event: "join", path: "/chat/general", data: { name: "Alice" }, id: 1 }`

The client auto-generates an incrementing numeric `id`. The server matches the reply by this ID.

#### Error handling

`call()` rejects with `WsClientError` in these cases:

| Scenario | Error code |
|----------|-----------|
| Not connected when called | 503 |
| Connection lost while waiting for reply | 503 |
| `client.close()` called while waiting | 503 |
| Timeout (`rpcTimeout` exceeded) | 408 |
| Server sent an error reply | Server's error code |

```ts
import { WsClientError } from '@wooksjs/ws-client'

try {
  await client.call('join', '/chat/general', { name: 'Alice' })
} catch (err) {
  if (err instanceof WsClientError) {
    if (err.code === 409) console.log('Name already taken')
    if (err.code === 408) console.log('Request timed out')
  }
}
```

## Listening for Push Messages

### `on()`

Register a handler for server-initiated push messages. Returns an unregister function.

```ts
const off = client.on('message', '/chat/general', ({ event, path, params, data }) => {
  console.log(`${data.from}: ${data.text}`)
})

// Later: stop listening
off()
```

#### Handler signature

```ts
interface WsClientPushEvent<T> {
  event: string                    // Event type from server
  path: string                     // Concrete path from server
  params: Record<string, string>   // Route params extracted by server (e.g. { room: 'general' })
  data: T                          // Payload
}
```

Route params are extracted by the **server** router and included in the push message. The client does not parse them.

#### Path matching

**Exact match** — O(1) lookup:

```ts
client.on('message', '/chat/general', handler)
// Matches: /chat/general
// Ignores: /chat/random, /chat/general/sub
```

**Wildcard suffix** — prefix matching:

```ts
client.on('message', '/chat/*', handler)
// Matches: /chat/general, /chat/random, /chat/general/sub
// Ignores: /users/42
```

Both exact and wildcard listeners fire if they match the same message. Multiple handlers for the same pattern are all called.

## Subscriptions

### `subscribe()`

Subscribe to a path with server acknowledgment and automatic resubscribe on reconnect.

```ts
const unsub = await client.subscribe('/notifications')

// Later: unsubscribe
unsub()
```

Under the hood:
1. Sends `{ event: "subscribe", path: "/notifications", id: N }` (RPC)
2. Waits for server acknowledgment
3. Tracks the subscription for auto-resubscribe after reconnect
4. Returns an unsubscribe function that sends `{ event: "unsubscribe", path: "/notifications" }` (fire-and-forget) and removes the tracking

You still need `on()` to handle the push messages that arrive on the subscribed path.

## Lifecycle Events

All lifecycle handlers return an unregister function. Multiple handlers can be registered for each event.

### onOpen

Fires when the connection opens, including after reconnect.

```ts
const off = client.onOpen(() => {
  console.log('Connected!')
})
```

After reconnect: queued messages are flushed first, then subscriptions are resubscribed, then `onOpen` fires.

### onClose

Fires on every close, including before reconnect attempts.

```ts
client.onClose((code, reason) => {
  console.log(`Disconnected: ${code} ${reason}`)
})
```

### onError

Fires on WebSocket error events.

```ts
client.onError((error) => {
  console.error('WebSocket error:', error)
})
```

### onReconnect

Fires before each reconnection attempt, after the backoff delay.

```ts
client.onReconnect((attempt) => {
  console.log(`Reconnecting... attempt ${attempt}`)
})
```

## Closing

```ts
client.close()
```

Closes the WebSocket with code 1000. Permanently disables reconnection. Rejects all pending RPCs with `WsClientError(503, 'Connection closed')`. Clears the message queue.

## Reconnection

Enable reconnection to automatically recover from dropped connections:

```ts
const client = createWsClient(url, {
  reconnect: true, // uses defaults
})

// Or with custom options:
const client = createWsClient(url, {
  reconnect: {
    enabled: true,
    maxRetries: 10,          // default: Infinity
    baseDelay: 1000,         // ms, default: 1000
    maxDelay: 30000,         // ms, default: 30000
    backoff: 'exponential',  // 'exponential' | 'linear', default: 'exponential'
  },
})
```

### Backoff

- **Exponential** (default): `min(baseDelay × 2^attempt, maxDelay)` → 1s, 2s, 4s, 8s, 16s, 30s, 30s, ...
- **Linear**: `min(baseDelay × (attempt + 1), maxDelay)` → 1s, 2s, 3s, 4s, ...

### What happens on unexpected close

1. All pending RPCs are rejected (code 503, "Connection lost")
2. `onClose` handlers fire
3. After backoff delay: `onReconnect` handlers fire, new WebSocket is created
4. On successful open: queued messages are flushed, subscriptions are resubscribed, `onOpen` fires

### Re-joining rooms after reconnect

Reconnection restores the WebSocket connection and resubscribes `subscribe()` calls, but it does not automatically re-join rooms. Handle this in `onOpen`:

```ts
client.onOpen(() => {
  // Re-join the room after reconnect
  client.call('join', `/chat/${currentRoom}`, { name: myName })
})
```

## Complete Example

```ts
import { createWsClient, WsClientError } from '@wooksjs/ws-client'

const client = createWsClient('ws://localhost:3000/ws', {
  reconnect: true,
  rpcTimeout: 5000,
})

// Wait for connection
await new Promise<void>(resolve => client.onOpen(resolve))

// Join a room (RPC)
try {
  await client.call('join', '/chat/general', { name: 'Alice' })
} catch (err) {
  if (err instanceof WsClientError && err.code === 409) {
    console.log('Name taken, try another')
  }
  throw err
}

// Listen for messages
client.on('message', '/chat/general', ({ data }) => {
  console.log(`${data.from}: ${data.text}`)
})

client.on('system', '/chat/general', ({ data }) => {
  console.log(`[system] ${data.text}`)
})

// Send a message (fire-and-forget)
client.send('message', '/chat/general', { text: 'Hello everyone!' })

// Leave and close
await client.call('leave', '/chat/general')
client.close()
```
