# Wire Protocol

The server (`@wooksjs/event-ws`) and client (`@wooksjs/ws-client`) communicate using a simple JSON protocol over WebSocket text frames. No custom framing, no binary encoding — just JSON.

[[toc]]

## Message Types

There are three message shapes:

### Client → Server

```ts
interface WsClientMessage {
  event: string            // Router method (e.g. "message", "join", "subscribe")
  path: string             // Route path (e.g. "/chat/general")
  data?: unknown           // Payload
  id?: string | number     // Correlation ID — present for RPC (call()), absent for fire-and-forget (send())
}
```

### Server → Client: Reply

Sent when the client message included an `id`. Exactly one reply per request.

```ts
interface WsReplyMessage {
  id: string | number               // Matches the client's correlation ID
  data?: unknown                     // Handler return value
  error?: { code: number; message: string }  // Present on error, mutually exclusive with data
}
```

### Server → Client: Push

Server-initiated messages: broadcasts, direct sends, subscription notifications.

```ts
interface WsPushMessage {
  event: string                      // Event type
  path: string                       // Concrete path
  params?: Record<string, string>    // Route params extracted by server router
  data?: unknown                     // Payload
}
```

## Message Flow

### RPC (call)

```
Client                              Server
  │                                   │
  │  { event: "join",                 │
  │    path: "/chat/general",         │
  │    data: { name: "Alice" },       │
  │    id: 1 }                        │
  │ ──────────────────────────────▶  │
  │                                   │ routes by event + path
  │                                   │ runs handler
  │                                   │
  │  { id: 1,                         │
  │    data: { joined: true } }       │
  │ ◀──────────────────────────────  │
```

### Fire-and-forget (send)

```
Client                              Server
  │                                   │
  │  { event: "message",             │
  │    path: "/chat/general",        │
  │    data: { text: "Hi!" } }       │
  │ ──────────────────────────────▶  │
  │                                   │ routes by event + path
  │                                   │ runs handler
  │                                   │ return value ignored (no id)
```

### Push (broadcast)

```
Client A                Server               Client B
  │                       │                     │
  │  { event: "message",  │                     │
  │    path: "/chat/gen", │                     │
  │    data: { text } }   │                     │
  │ ─────────────────────▶│                     │
  │                       │  { event: "message",│
  │                       │    path: "/chat/gen",│
  │                       │    params: { room: "gen" },
  │                       │    data: { text } } │
  │                       │────────────────────▶│
```

## Routing

The server routes incoming messages using `event` as the method and `path` as the route pattern, identical to how HTTP uses `GET`/`POST` + URL:

```ts
// Server
ws.onMessage('join', '/chat/:room', handler)     // matches event="join", path="/chat/general"
ws.onMessage('message', '/chat/:room', handler)  // matches event="message", path="/chat/general"
ws.onMessage('query', '/users/:id', handler)     // matches event="query", path="/users/42"
ws.onMessage('echo', '/*', handler)              // matches event="echo", any path
```

Route parameters are extracted by the router and available via `useRouteParams()`.

## Error Responses

### Handler error

When a handler throws and the client sent an `id`:

```json
{ "id": 1, "error": { "code": 400, "message": "Name is required" } }
```

### No matching handler

When no handler matches the event + path and the client sent an `id`:

```json
{ "id": 1, "error": { "code": 404, "message": "Not found" } }
```

### Unhandled error

When a non-`WsError` exception is thrown:

```json
{ "id": 1, "error": { "code": 500, "message": "Internal Error" } }
```

If the client didn't send an `id`, errors are logged server-side but nothing is sent to the client.

## Message Discrimination

The client distinguishes incoming messages by shape:

| Shape | Type | Routed to |
|-------|------|----------|
| Has `id` field | Reply | RPC tracker — resolves or rejects a pending `call()` |
| Has `event` + `path` fields | Push | Push dispatcher — fires matching `on()` handlers |
| Unparseable | — | Silently dropped |

## Edge Cases

| Scenario | Behavior |
|----------|---------|
| Message exceeds `maxMessageSize` (default: 1 MB) | Silently dropped, connection stays open |
| JSON parse failure | Silently dropped |
| No handler matched, no `id` | Silently dropped |
| No handler matched, has `id` | `{ id, error: { code: 404, message: "Not found" } }` |

## Custom Serialization

Both server and client support pluggable serialization for advanced use cases (e.g. MessagePack, CBOR):

```ts
// Server
const ws = createWsApp(http, {
  messageParser: myDecode,
  messageSerializer: myEncode,
})

// Client
const client = createWsClient(url, {
  messageParser: myDecode,
  messageSerializer: myEncode,
})
```

Both sides must use the same serialization format.
