# Introduction to Wooks WebSocket

::: warning Experimental
This package is in an experimental phase. The API may change without following semver until it reaches a stable release.
:::

`@wooksjs/event-ws` is the WebSocket adapter for Wooks. It gives you a routed WebSocket server where every handler is a plain function, and every piece of connection and message data is available through composables — on demand, typed, cached. Pair it with `@wooksjs/ws-client` for a structured, type-safe client.

## Quick Picture

```ts
import { createHttpApp } from '@wooksjs/event-http'
import { createWsApp, useWsMessage, useWsRooms } from '@wooksjs/event-ws'

const http = createHttpApp()
const ws = createWsApp(http) // auto-registers upgrade contract

http.upgrade('/ws', () => ws.upgrade())

ws.onMessage('message', '/chat/:room', () => {
  const { data } = useWsMessage<{ text: string }>()
  const { broadcast } = useWsRooms()
  broadcast('message', data)
})

http.listen(3000)
```

Messages are routed by **event** + **path**, just like HTTP methods + URL. Composables give you the connection, message, room membership, and server-wide state — all without callback parameters.

## What You Get

### Server (`@wooksjs/event-ws`)

| Composable | What it provides |
|------------|-----------------|
| `useWsConnection()` | Connection ID, send push messages, close connection |
| `useWsMessage()` | Typed message payload, raw data, correlation ID, event, path |
| `useWsRooms()` | Join/leave rooms, broadcast to room members |
| `useWsServer()` | All connections, server-wide broadcast, room membership queries |
| `useRouteParams()` | Typed route parameters (from `@wooksjs/event-core`) |

Plus `WsError` for structured error responses, heartbeat keep-alive, and a pluggable broadcast transport for multi-instance deployments (e.g. Redis pub/sub).

### Client (`@wooksjs/ws-client`)

| Method | What it does |
|--------|-------------|
| `send(event, path, data?)` | Fire-and-forget message |
| `call(event, path, data?)` | RPC with automatic correlation — returns a Promise |
| `subscribe(path, data?)` | Subscribe with auto-resubscribe on reconnect |
| `on(event, pathPattern, handler)` | Listen for server push messages (exact or wildcard paths) |

Zero runtime dependencies. Works in browsers (native `WebSocket`) and Node.js (with `ws` package).

## How It Fits Together

The server and client share a simple JSON wire protocol. The client sends `{ event, path, data?, id? }`, the server routes by `event` + `path`, and replies with `{ id, data? }` or pushes `{ event, path, data? }`. No custom framing, no binary encoding — just JSON over WebSocket.

HTTP composables (`useHeaders()`, `useCookies()`, `useAuthorization()`, etc.) work inside WebSocket handlers too — they read from the original upgrade request through the parent context chain.

## Next Steps

- [Quick Start](/wsapp/) — Set up a WebSocket server and client in minutes.
- [What is Wooks?](/wooks/what) — How composables, context, and `defineWook` work under the hood.
- [Client Guide](/wsapp/client) — Full guide to the browser/Node.js client.
- [Wire Protocol](/wsapp/protocol) — The JSON message format in detail.
