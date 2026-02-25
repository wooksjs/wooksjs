# RPC & subscriptions — @wooksjs/ws-client

> Request-response calls with correlation IDs, timeouts, and managed subscriptions with auto-resubscribe.

## Concepts

RPC in `@wooksjs/ws-client` uses correlation IDs to match requests with responses. When you call `client.call()`, the client:

1. Generates an auto-incrementing numeric `id`
2. Sends `{ event, path, data, id }` to the server
3. Starts a timeout timer
4. Returns a `Promise` that resolves/rejects when the server replies with the same `id`

The server must include the `id` in its `WsReplyMessage` for the response to be matched.

Subscriptions build on RPC — `subscribe()` calls `call('subscribe', path, data)` and remembers the subscription for auto-resubscribe on reconnect.

## API Reference

### `client.call<T>(event, path, data?): Promise<T>`

Send a message with an auto-generated correlation ID and wait for the server's reply.

- Rejects with `WsClientError(503)` if not connected
- Rejects with `WsClientError(408)` on timeout (default: 10s)
- Rejects with `WsClientError(code, message)` if the server replies with an `error`
- Resolves with `reply.data` typed as `T`

```ts
interface User {
  name: string
  email: string
}

const user = await client.call<User>('rpc', '/users/me')
```

### `client.subscribe(path, data?): Promise<() => void>`

Subscribe to a server path:

1. Sends `{ event: 'subscribe', path, data, id }` via RPC
2. Waits for server confirmation (reply)
3. Stores `{ path, data }` for auto-resubscribe on reconnect
4. Returns an unsubscribe function that:
   - Removes the stored subscription
   - Sends `{ event: 'unsubscribe', path }` (fire-and-forget) if still connected

```ts
const unsub = await client.subscribe('/chat/rooms/lobby')

// Later:
unsub()
```

### `RpcTracker` (internal)

Tracks pending RPC calls. Not part of the public API but useful for understanding internals:

- `generateId()` — auto-incrementing numeric IDs
- `track(id, timeout)` — returns a Promise, starts timeout timer
- `resolve(reply)` — matches `reply.id`, resolves or rejects based on `reply.error`
- `rejectAll(code, message)` — called on disconnect/close, rejects all pending promises

## Common Patterns

### Pattern: Error handling

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

### Pattern: Multiple subscriptions

```ts
const unsubs: Array<() => void> = []

unsubs.push(await client.subscribe('/chat/rooms/lobby'))
unsubs.push(await client.subscribe('/chat/rooms/general'))
unsubs.push(await client.subscribe('/notifications'))

// Cleanup:
for (const unsub of unsubs) unsub()
```

### Pattern: Typed RPC calls

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

## Best Practices

- Set `rpcTimeout` to match your server's expected response time — 10s default is generous for most APIs
- Always handle `WsClientError` in `.catch()` — unhandled rejections from timeout or disconnect are common
- Use `subscribe()` for durable subscriptions that should survive reconnections; use `send()` for one-off events
- Store unsubscribe functions and call them during cleanup to avoid server-side resource leaks

## Gotchas

- `call()` rejects immediately if not connected — it does NOT queue. Use `send()` for queued fire-and-forget
- RPC IDs are auto-incrementing integers, not UUIDs — they reset to 1 on new `WsClient` instances
- On disconnect, ALL pending RPCs are rejected with code 503 — there is no retry mechanism for in-flight calls
- `subscribe()` rejects if the server's subscribe handler throws/rejects — the subscription is NOT stored in that case
- Auto-resubscribe on reconnect silently swallows errors — check server logs if subscriptions seem lost
