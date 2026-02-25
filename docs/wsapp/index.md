# Get Started with WebSocket

::: warning Experimental
This package is in an experimental phase. The API may change without following semver until it reaches a stable release.
:::

::: info
Learn more about Wooks to understand its philosophy and advantages:

- [What is Wooks?](/wooks/what)
- [Why Wooks?](/wooks/why)
- [Introduction to Wooks WebSocket](/wsapp/introduction)
:::

## Installation

The WebSocket flavor uses two packages — one for the server, one for the client:

```bash
# Server
npm install @wooksjs/event-ws @wooksjs/event-http ws

# Client (browser or Node.js)
npm install @wooksjs/ws-client
```

The server requires `@wooksjs/event-http` because WebSocket connections start as HTTP upgrade requests. The `ws` package provides the underlying WebSocket implementation for Node.js.

### AI Agent Skills

Both packages ship with structured skill files for AI coding agents (Claude Code, Cursor, Windsurf, Codex, etc.).

```bash
# Server skills
npx wooksjs-event-ws-skill

# Client skills
npx wooksjs-ws-client-skill
```

To keep skills automatically up-to-date, add postinstall scripts to your `package.json`:

```json
{
  "scripts": {
    "postinstall": "wooksjs-event-ws-skill --postinstall && wooksjs-ws-client-skill --postinstall"
  }
}
```

## Server: Hello World

A minimal server that echoes messages back to the sender.

```ts
import { createHttpApp } from '@wooksjs/event-http'
import { createWsApp, useWsMessage, useWsConnection } from '@wooksjs/event-ws'

const http = createHttpApp()
const ws = createWsApp(http) // auto-registers as upgrade handler

// HTTP route that upgrades to WebSocket
http.upgrade('/ws', () => ws.upgrade())

// Handle "echo" events on any path
ws.onMessage('echo', '/*', () => {
  const { data, path } = useWsMessage()
  return { echoed: data, path } // → sent back as reply
})

http.listen(3000, () => {
  console.log('WebSocket server ready on ws://localhost:3000/ws')
})
```

Messages are routed by **event type** (like an HTTP method) and **path** (like a URL). The handler return value is sent back as a reply when the client used `call()` (RPC).

## Client: Connecting

### Browser

```ts
import { createWsClient } from '@wooksjs/ws-client'

const client = createWsClient('ws://localhost:3000/ws', {
  reconnect: true,
  rpcTimeout: 5000,
})

client.onOpen(() => console.log('Connected!'))

// RPC — returns a Promise
const result = await client.call('echo', '/hello', { message: 'Hi!' })
console.log(result) // → { echoed: { message: 'Hi!' }, path: '/hello' }
```

### Node.js

```ts
import WebSocket from 'ws'
import { createWsClient } from '@wooksjs/ws-client'

const client = createWsClient('ws://localhost:3000/ws', {
  _WebSocket: WebSocket as any, // [!code hl]
  rpcTimeout: 5000,
})
```

The only difference is passing the `ws` package as `_WebSocket`. Everything else works the same.

## Adding Rooms

A chat server where clients join rooms and broadcast messages.

```ts
import { createHttpApp } from '@wooksjs/event-http'
import {
  createWsApp,
  useWsMessage,
  useWsRooms,
  WsError,
} from '@wooksjs/event-ws'

const http = createHttpApp()
const ws = createWsApp(http)

http.upgrade('/ws', () => ws.upgrade())

// Join a room
ws.onMessage('join', '/chat/:room', () => {
  const { data } = useWsMessage<{ name: string }>()
  if (!data?.name) throw new WsError(400, 'Name is required')

  const { join, broadcast } = useWsRooms()
  join()  // joins the room matching the current path: /chat/:room
  broadcast('system', { text: `${data.name} joined` })
  return { joined: true }
})

// Send a message to a room
ws.onMessage('message', '/chat/:room', () => {
  const { data } = useWsMessage<{ text: string; from: string }>()
  const { broadcast } = useWsRooms()
  broadcast('message', data)  // sends to all room members except sender
})

http.listen(3000)
```

```ts
// Client usage
const client = createWsClient('ws://localhost:3000/ws')

await client.call('join', '/chat/general', { name: 'Alice' })

client.on('message', '/chat/general', ({ data }) => {
  console.log(`${data.from}: ${data.text}`)
})

client.on('system', '/chat/general', ({ data }) => {
  console.log(`[system] ${data.text}`)
})

client.send('message', '/chat/general', { text: 'Hello!', from: 'Alice' })
```

## Standalone Server

If you don't need HTTP routes alongside WebSocket, use standalone mode:

```ts
import { createWsApp, useWsMessage } from '@wooksjs/event-ws'

const ws = createWsApp()

ws.onMessage('echo', '/*', () => {
  const { data } = useWsMessage()
  return data
})

ws.listen(3000)
```

In standalone mode, all connections are accepted — there's no HTTP upgrade route to configure.

## Next Steps

- [Composables](/wsapp/composables) — Full reference for all server composables.
- [Rooms & Broadcasting](/wsapp/rooms) — Deep dive into room management and broadcasting.
- [Client Guide](/wsapp/client) — Complete client API: RPC, subscriptions, reconnection, error handling.
- [Wire Protocol](/wsapp/protocol) — Understand the JSON message format.
