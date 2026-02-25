# Reconnection — @wooksjs/ws-client

> Auto-reconnection with configurable backoff, message queuing during disconnect, and subscription rehydration.

## Concepts

When `reconnect` is enabled, the client automatically attempts to re-establish the connection after an unexpected close. The reconnection system has three components:

1. **ReconnectController** — manages backoff timing and attempt counting
2. **MessageQueue** — buffers `send()` messages while disconnected
3. **Subscription store** — remembers active subscriptions for auto-resubscribe

On reconnection:

1. Backoff delay elapses → new WebSocket connection attempt
2. On open → reset attempt counter, flush queued messages, re-subscribe all stored subscriptions
3. On failure → increment attempt, schedule next attempt (up to `maxRetries`)

## API Reference

### `WsClientReconnectOptions`

```ts
interface WsClientReconnectOptions {
  enabled: boolean // must be true to enable
  maxRetries?: number // default: Infinity
  baseDelay?: number // ms (default: 1000)
  maxDelay?: number // ms (default: 30000)
  backoff?: 'linear' | 'exponential' // default: 'exponential'
}
```

Shorthand: pass `reconnect: true` for defaults, `reconnect: false` to disable.

### Backoff calculation

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

### `client.onReconnect(handler): () => void`

Register a handler called before each reconnection attempt. Receives the attempt number.

```ts
client.onReconnect((attempt) => {
  console.log(`Reconnecting... attempt #${attempt}`)
})
```

### Message queuing

When disconnected and reconnect is enabled:

- `send()` queues messages (serialized strings)
- `call()` rejects immediately with code 503 (NOT queued)
- On reconnect success, all queued messages are flushed in order

### Auto-resubscribe

Subscriptions created via `subscribe()` are stored as `Map<path, data>`. On successful reconnect, the client calls `call('subscribe', path, data)` for each stored subscription. Failures are silently caught and will retry on the next reconnect.

## Common Patterns

### Pattern: Basic reconnect

```ts
const client = createWsClient('wss://api.example.com/ws', {
  reconnect: true, // exponential backoff, unlimited retries
})
```

### Pattern: Custom backoff

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

### Pattern: Reconnect with UI feedback

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

### Pattern: Send during disconnection

```ts
// With reconnect enabled, messages are queued:
client.send('message', '/chat/rooms/lobby', { text: 'hello' })
// If disconnected, this will be sent when the connection is restored

// RPCs are NOT queued — they reject immediately:
try {
  await client.call('rpc', '/users/me')
} catch (err) {
  // WsClientError(503, 'Not connected')
}
```

## Best Practices

- Use exponential backoff (default) for production — it reduces server load during outages
- Set `maxRetries` for scenarios where giving up is better than infinite retry (e.g., auth failures)
- Monitor `onReconnect` to update UI state
- Use `send()` for messages that can tolerate delayed delivery; use `call()` only when you need an immediate response
- Call `client.close()` to permanently stop reconnection — useful on logout or page unload

## Gotchas

- `client.close()` permanently disables reconnection — there is no way to re-enable it; create a new `WsClient` instead
- Queued messages are lost if `client.close()` is called — the queue is cleared
- Auto-resubscribe happens after `onOpen` handlers fire — your `onOpen` handler runs before subscriptions are re-established
- The attempt counter resets to 0 on successful connection — if the connection drops again, backoff restarts from `baseDelay`
- `call()` during disconnection always rejects, even with reconnect enabled — there is no "queue and resolve later" mode for RPCs
