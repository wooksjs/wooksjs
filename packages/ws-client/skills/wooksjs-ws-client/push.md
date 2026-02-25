# Push listeners — @wooksjs/ws-client

> Client-side listeners for server push messages with exact and wildcard path matching.

## Concepts

Server push messages (`WsPushMessage`) arrive without a correlation ID — they represent broadcasts, room messages, or subscription notifications. The client dispatches these to registered handlers based on `event` + `path` matching.

Two matching modes:

1. **Exact match** — O(1) Map lookup by `"event:path"` key
2. **Wildcard match** — path pattern ends with `*`, uses `startsWith` prefix check

Handlers receive a `WsClientPushEvent<T>` with typed `data`.

## API Reference

### `client.on<T>(event, pathPattern, handler): () => void`

Register a push listener. Returns an unregister function.

Parameters:

- `event: string` — the event type to match (e.g. `"message"`, `"notification"`)
- `pathPattern: string` — exact path or wildcard (`"/chat/rooms/*"`)
- `handler: WsPushHandler<T>` — receives `WsClientPushEvent<T>`

```ts
interface WsClientPushEvent<T = unknown> {
  event: string // event type from server
  path: string // concrete path from server
  params: Record<string, string> // route params from server
  data: T // typed payload
}

type WsPushHandler<T = unknown> = (ev: WsClientPushEvent<T>) => void
```

### Matching rules

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

The wildcard `*` only works as a suffix — `"/*/rooms"` is NOT supported.

## Common Patterns

### Pattern: Listen for chat messages in all rooms

```ts
client.on<{ text: string; from: string }>('message', '/chat/rooms/*', ({ data, path, params }) => {
  console.log(`[${params.roomId ?? path}] ${data.from}: ${data.text}`)
})
```

### Pattern: Notifications

```ts
client.on<{ title: string; body: string }>('notification', '/notifications', ({ data }) => {
  showToast(data.title, data.body)
})
```

### Pattern: Multiple listeners for the same path

```ts
// Both handlers fire for the same message
client.on('message', '/chat/rooms/lobby', ({ data }) => updateUI(data))
client.on('message', '/chat/rooms/lobby', ({ data }) => logMessage(data))
```

### Pattern: Cleanup

```ts
const handlers: Array<() => void> = []

handlers.push(client.on('message', '/chat/*', handleChat))
handlers.push(client.on('notification', '/alerts', handleAlert))

// Cleanup all:
for (const off of handlers) off()
```

## Best Practices

- Use wildcard patterns sparingly — each incoming push message is checked against all wildcards (linear scan)
- Prefer exact paths when the set of paths is known at compile time
- Always store the unregister function to prevent memory leaks when handlers are no longer needed
- Type the generic `<T>` on `on<T>()` to get typed `data` in the handler

## Gotchas

- Wildcard only works as a suffix (`/path/*`); it is NOT a glob or regex
- The `params` field comes from the server (extracted by the Wooks router) — the client does NOT parse path params itself
- If no handler matches a push message, it is silently dropped
- Handlers are called synchronously in iteration order — a slow handler delays dispatch to subsequent handlers
- The event type must match exactly — there is no wildcard for event types
