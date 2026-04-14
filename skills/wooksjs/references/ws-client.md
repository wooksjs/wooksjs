# @wooksjs/ws-client -- Reference

## Table of Contents

1. [Overview](#overview)
2. [Setup: createWsClient](#setup)
3. [WsClientOptions](#wsclientoptions)
4. [WsClient API](#wsclient-api)
   - [send](#clientsendevent-path-data)
   - [call](#clientcalltevent-path-data-promiset)
   - [subscribe](#clientsubscribepath-data-promise---void)
   - [on](#clientontevent-pathpattern-handler---void)
   - [close](#clientclose)
   - [Lifecycle events](#lifecycle-events)
5. [Push Listeners](#push-listeners)
   - [Matching rules](#matching-rules)
   - [WsClientPushEvent](#wsclientpusheventt)
6. [RPC](#rpc)
7. [Reconnection](#reconnection)
   - [WsClientReconnectOptions](#wsclientreconnectoptions)
   - [Backoff calculation](#backoff-calculation)
   - [Message queuing](#message-queuing)
   - [Auto-resubscribe](#auto-resubscribe)
8. [WsClientError Codes](#wsclienterror-codes)
9. [Patterns](#patterns)
10. [Best Practices](#best-practices)
11. [Gotchas](#gotchas)

---

## Overview

Standalone WebSocket client -- no dependency on `@wooksjs/event-core` or any wooks package. Designed to pair with `@wooksjs/event-ws` using the same JSON wire protocol.

Wire protocol types are defined in [event-ws.md](event-ws.md#wire-protocol) -- do not duplicate them here.

Provides:

- Fire-and-forget messaging via `send()`
- RPC (request-response) via `call()` with correlation IDs and timeouts
- Subscriptions via `subscribe()` with auto-resubscribe on reconnect
- Push listeners via `on()` with exact and wildcard path matching
- Auto-reconnection with configurable backoff
- Message queuing when disconnected (with reconnect enabled)

Uses the native `WebSocket` API (browsers and Node.js >= 22). For Node.js < 22, install the `ws` package (optional peer dependency).

---

## Setup

### `createWsClient(url, options?): WsClient`

Factory function. Create and immediately connect a `WsClient`.

```ts
import { createWsClient } from '@wooksjs/ws-client'

const client = createWsClient('wss://api.example.com/ws', {
  reconnect: true,
  rpcTimeout: 5000,
})
```

The client connects immediately on construction -- there is no `connect()` method.

---

## WsClientOptions

```ts
interface WsClientOptions {
  protocols?: string | string[]                          // WebSocket sub-protocols
  reconnect?: boolean | WsClientReconnectOptions         // default: disabled
  rpcTimeout?: number                                    // ms (default: 10000)
  messageParser?: (raw: string) => WsReplyMessage | WsPushMessage
  messageSerializer?: (msg: WsClientMessage) => string
  _WebSocket?: WebSocketConstructor                      // @internal -- for testing
}
```

---

## WsClient API

### `client.send(event, path, data?)`

Fire-and-forget message. Queued when disconnected if reconnect is enabled; otherwise silently dropped.

```ts
client.send('message', '/chat/rooms/lobby', { text: 'hello' })
```

### `client.call<T>(event, path, data?): Promise<T>`

RPC call. Auto-generate a correlation ID. Reject with `WsClientError` on timeout, server error, or disconnect.

- Reject with `WsClientError(503)` if not connected
- Reject with `WsClientError(408)` on timeout (default: 10s)
- Reject with `WsClientError(code, message)` if the server replies with an `error`
- Resolve with `reply.data` typed as `T`

```ts
const user = await client.call<User>('rpc', '/users/me')
```

### `client.subscribe(path, data?): Promise<() => void>`

Subscribe to a server path:

1. Send `{ event: 'subscribe', path, data, id }` via RPC
2. Wait for server confirmation (reply)
3. Store `{ path, data }` for auto-resubscribe on reconnect
4. Return an unsubscribe function that:
   - Remove the stored subscription
   - Send `{ event: 'unsubscribe', path }` (fire-and-forget) if still connected

```ts
const unsub = await client.subscribe('/chat/rooms/lobby')
// later:
unsub() // sends "unsubscribe" event
```

`subscribe()` rejects if the server's subscribe handler throws/rejects -- the subscription is NOT stored in that case.

### `client.on<T>(event, pathPattern, handler): () => void`

Register a client-side push listener. Support exact paths and wildcard (`*`) suffix. Return an unregister function.

```ts
const off = client.on<{ text: string }>('message', '/chat/rooms/*', ({ data, path }) => {
  console.log(`${path}: ${data.text}`)
})
```

See [Push Listeners](#push-listeners) for matching rules.

### `client.close()`

Close the connection. Disable reconnect permanently. Reject all pending RPCs. Clear the message queue.

### Lifecycle Events

```ts
client.onOpen(() => console.log('Connected'))
client.onClose((code, reason) => console.log(`Closed: ${code}`))
client.onError((event) => console.error('Error:', event))
client.onReconnect((attempt) => console.log(`Reconnecting #${attempt}`))
```

All lifecycle methods return an unregister function.

---

## Push Listeners

### `WsClientPushEvent<T>`

```ts
interface WsClientPushEvent<T = unknown> {
  event: string                   // event type from server
  path: string                    // concrete path from server
  params: Record<string, string>  // route params from server
  data: T                         // typed payload
}

type WsPushHandler<T = unknown> = (ev: WsClientPushEvent<T>) => void
```

### Matching Rules

Two dispatch modes:

1. **Exact match** -- O(1) Map lookup by `"event:path"` key
2. **Wildcard match** -- path pattern ends with `*`, use `startsWith` prefix check (linear scan)

**Exact:**

```ts
client.on('message', '/chat/rooms/lobby', handler)
// Matches: { event: 'message', path: '/chat/rooms/lobby' }
// No match: { event: 'message', path: '/chat/rooms/general' }
```

**Wildcard:**

```ts
client.on('message', '/chat/rooms/*', handler)
// Matches: { event: 'message', path: '/chat/rooms/lobby' }
// Matches: { event: 'message', path: '/chat/rooms/general' }
// No match: { event: 'notification', path: '/chat/rooms/lobby' }
```

The wildcard `*` only works as a **suffix** -- `"/*/rooms"` is NOT supported.

The `params` field comes from the server (extracted by the Wooks router) -- the client does NOT parse path params itself.

---

## RPC

RPC uses correlation IDs to match requests with responses. When `call()` is invoked:

1. Generate an auto-incrementing numeric `id`
2. Send `{ event, path, data, id }` to the server
3. Start a timeout timer
4. Return a `Promise` that resolves/rejects when the server replies with the same `id`

The server must include the `id` in its `WsReplyMessage` for the response to be matched.

Subscriptions build on RPC -- `subscribe()` calls `call('subscribe', path, data)` and remembers the subscription for auto-resubscribe on reconnect.

**RpcTracker (internal):**

- `generateId()` -- auto-incrementing numeric IDs (reset to 1 on new `WsClient` instances)
- `track(id, timeout)` -- return a Promise, start timeout timer
- `resolve(reply)` -- match `reply.id`, resolve or reject based on `reply.error`
- `rejectAll(code, message)` -- called on disconnect/close, reject all pending promises

---

## Reconnection

### WsClientReconnectOptions

```ts
interface WsClientReconnectOptions {
  enabled: boolean           // must be true to enable
  maxRetries?: number        // default: Infinity
  baseDelay?: number         // ms (default: 1000)
  maxDelay?: number          // ms (default: 30000)
  backoff?: 'linear' | 'exponential'  // default: 'exponential'
}
```

Shorthand: pass `reconnect: true` for defaults, `reconnect: false` to disable.

### Backoff Calculation

**Exponential** (default): `delay = baseDelay * 2^attempt` (capped at `maxDelay`)

- Attempt 0: 1000ms
- Attempt 1: 2000ms
- Attempt 2: 4000ms
- Attempt 3: 8000ms
- ... capped at 30000ms

**Linear**: `delay = baseDelay * (attempt + 1)` (capped at `maxDelay`)

- Attempt 0: 1000ms
- Attempt 1: 2000ms
- Attempt 2: 3000ms
- ... capped at 30000ms

### Reconnection Flow

1. Backoff delay elapses -> new WebSocket connection attempt
2. On open -> reset attempt counter, flush queued messages, re-subscribe all stored subscriptions
3. On failure -> increment attempt, schedule next attempt (up to `maxRetries`)

### `client.onReconnect(handler): () => void`

Register a handler called before each reconnection attempt. Receive the attempt number.

```ts
client.onReconnect((attempt) => {
  console.log(`Reconnecting... attempt #${attempt}`)
})
```

### Message Queuing

When disconnected and reconnect is enabled:

- `send()` queue messages (serialized strings)
- `call()` reject immediately with code 503 (NOT queued)
- On reconnect success, all queued messages are flushed in order

### Auto-resubscribe

Subscriptions created via `subscribe()` are stored as `Map<path, data>`. On successful reconnect, the client calls `call('subscribe', path, data)` for each stored subscription. Failures are silently caught and retry on the next reconnect.

Auto-resubscribe happens after `onOpen` handlers fire -- `onOpen` handler runs before subscriptions are re-established.

---

## WsClientError Codes

```ts
class WsClientError extends Error {
  constructor(public readonly code: number, message?: string)
}
```

| Code  | Meaning                                              | Source           |
| ----- | ---------------------------------------------------- | ---------------- |
| `408` | RPC timeout                                          | Client           |
| `503` | Not connected / connection lost / connection closed  | Client           |
| `4xx` | Server-side client errors (e.g. 403, 404)            | Server reply     |
| `5xx` | Server-side server errors (e.g. 500)                 | Server reply     |

Server error codes come from `WsReplyMessage.error.code`.

---

## Patterns

### RPC with Error Handling

```ts
try {
  const result = await client.call('rpc', '/protected/resource')
} catch (err) {
  if (err instanceof WsClientError) {
    switch (err.code) {
      case 403:
        console.log('Forbidden')
        break
      case 404:
        console.log('Not found')
        break
      case 408:
        console.log('Timeout')
        break
      case 503:
        console.log('Not connected')
        break
      default:
        console.log(`Error ${err.code}: ${err.message}`)
    }
  }
}
```

### Reconnect with UI Feedback

```ts
const client = createWsClient('wss://api.example.com/ws', { reconnect: true })

client.onClose((code, reason) => {
  showBanner('Connection lost, reconnecting...')
})

client.onReconnect((attempt) => {
  updateBanner(`Reconnecting (attempt ${attempt})...`)
})

client.onOpen(() => {
  hideBanner()
})
```

### Custom Serializer

```ts
const client = createWsClient('wss://api.example.com/ws', {
  messageSerializer: (msg) => JSON.stringify(msg),
  messageParser: (raw) => JSON.parse(raw),
})
```

### Custom Backoff

```ts
const client = createWsClient('wss://api.example.com/ws', {
  reconnect: {
    enabled: true,
    maxRetries: 10,
    baseDelay: 500,
    maxDelay: 15000,
    backoff: 'linear',
  },
})
```

### Typed RPC Calls

```ts
interface CreateRoomResponse {
  roomId: string
  created: boolean
}

const response = await client.call<CreateRoomResponse>('rpc', '/rooms/create', {
  name: 'My Room',
})
console.log(response.roomId)
```

---

## Best Practices

- Always enable `reconnect` for production clients -- network interruptions are inevitable.
- Set `rpcTimeout` appropriate for your use case (default: 10s).
- Use typed generics with `call<T>()` and `on<T>()` for type-safe payloads.
- Store the unsubscribe/unregister functions returned by `subscribe()`, `on()`, `onOpen()`, etc. to prevent leaks.
- Call `client.close()` when the client is no longer needed.
- Use exponential backoff (default) for production -- reduce server load during outages.
- Set `maxRetries` for scenarios where giving up is better than infinite retry (e.g., auth failures).
- Monitor `onReconnect` to update UI state.
- Use `send()` for messages that can tolerate delayed delivery; use `call()` only when an immediate response is needed.
- Use `subscribe()` for durable subscriptions that should survive reconnections; use `send()` for one-off events.
- Always handle `WsClientError` in `.catch()` -- unhandled rejections from timeout or disconnect are common.
- Prefer exact paths over wildcard patterns when the set of paths is known at compile time. Each incoming push message is checked against all wildcards (linear scan).

---

## Gotchas

- **`call()` always rejects when disconnected** -- it does NOT queue like `send()`, even with reconnect enabled. There is no "queue and resolve later" mode for RPCs.
- **`send()` only queues when disconnected if `reconnect` is enabled**; otherwise the message is silently dropped.
- **`client.close()` permanently disables reconnection** -- there is no way to re-enable it; create a new `WsClient` instead.
- **Queued messages are lost if `client.close()` is called** -- the queue is cleared.
- The client connects immediately on construction -- there is no `connect()` method.
- For Node.js < 22 without the `ws` package, the constructor throws `TypeError`.
- Auto-resubscribe on reconnect silently swallows errors -- check server logs if subscriptions seem lost. The next reconnect will retry.
- Auto-resubscribe happens after `onOpen` handlers fire -- `onOpen` runs before subscriptions are re-established.
- On disconnect, ALL pending RPCs are rejected with code 503 -- there is no retry mechanism for in-flight calls.
- RPC IDs are auto-incrementing integers, not UUIDs -- they reset to 1 on new `WsClient` instances.
- `subscribe()` rejects if the server's subscribe handler throws/rejects -- the subscription is NOT stored in that case.
- The attempt counter resets to 0 on successful connection -- if the connection drops again, backoff restarts from `baseDelay`.
- Wildcard only works as a **suffix** (`/path/*`); it is NOT a glob or regex.
- The `params` field in push events comes from the server (Wooks router) -- the client does NOT parse path params itself.
- If no handler matches a push message, it is silently dropped.
- Handlers are called synchronously in iteration order -- a slow handler delays dispatch to subsequent handlers.
- The event type must match exactly -- there is no wildcard for event types.
