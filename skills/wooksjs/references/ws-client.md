# @wooksjs/ws-client -- Reference

## Contents

- [Overview](#overview)
- [Setup](#setup) — `createWsClient`
- [WsClientOptions](#wsclientoptions) — `protocols`, `reconnect`, `rpcTimeout`, parser/serializer
- [WsClient API](#wsclient-api) — `send`, `call`, `subscribe`, `on`, `close`, lifecycle events
- [Push Listeners](#push-listeners) — matching rules, `WsClientPushEvent`
- [RPC](#rpc) — correlation IDs, `RpcTracker`
- [Reconnection](#reconnection) — `WsClientReconnectOptions`, backoff, queuing, auto-resubscribe
- [WsClientError Codes](#wsclienterror-codes) — 408, 503, 4xx/5xx server codes
- [Patterns](#patterns) — error handling, UI feedback, custom serializer/backoff, typed RPC
- [Rules & Gotchas](#rules--gotchas)

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

Order on reconnect: reset backoff → flush queued sends → initiate `subscribe` RPCs → fire `onOpen` handlers. Subscribe RPCs are in-flight (not yet confirmed) when `onOpen` runs.

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

## Rules & Gotchas

Lifecycle:
- Client connects immediately on construction — no `connect()` method.
- `close()` permanently disables reconnection — create a new `WsClient` to reconnect. Queued messages cleared.
- Node.js < 22: install `ws` peer dep or constructor throws `TypeError`.

`send()` vs `call()` when disconnected:
- `send()` queues **only if** `reconnect` is enabled, else silently dropped.
- `call()` rejects immediately with `WsClientError(503)` — never queued, even with reconnect.
- On disconnect, ALL pending RPCs reject with 503 — no retry.

Reconnect:
- Order on reconnect: backoff reset → flush queue → initiate subscribe RPCs → fire `onOpen`.
- Attempt counter resets on successful connect; a later drop restarts from `baseDelay`.
- Auto-resubscribe swallows subscribe errors — next reconnect retries.
- `subscribe()` rejects (and does NOT store) if the server's subscribe handler throws — no auto-resubscribe for rejected subscriptions.

RPC:
- IDs auto-increment starting at 1 per `WsClient` instance (not UUIDs, no per-reconnect reset).
- Always catch `WsClientError` from `call()` — timeout/disconnect rejections are common.

Push listeners:
- Wildcard `*` is **suffix-only** (`/path/*`) — not glob/regex. Event type must match exactly.
- Each push is checked against all wildcard patterns (linear scan) — prefer exact paths when known.
- `params` comes from the server's router extraction — client does NOT parse path params.
- Unmatched pushes silently dropped. Handlers run sync in iteration order.

Usage tips:
- Enable `reconnect` in production. Set `maxRetries` for give-up scenarios (e.g. auth failures).
- Store returned unsubscribe/unregister functions; call them on teardown.
- Use `send()` for fire-and-forget, `call()` only when a response is required.
- Use `subscribe()` for durable subscriptions (survive reconnects).
