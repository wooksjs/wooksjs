# Wooks Flavors

Wooks is event-agnostic by design. The core — `EventContext`, `defineWook`, `key`, `cached` — works the same regardless of what triggered the event. On top of this core, Wooks provides **adapters** (flavors) for specific event domains.

## HTTP

**Package:** `@wooksjs/event-http`

Build Node.js HTTP servers where every handler is a plain function that returns its response. Request data is available through wooks — on demand, typed, cached.

```ts
import { createHttpApp } from '@wooksjs/event-http'
import { useBody } from '@wooksjs/http-body'

const app = createHttpApp()

app.post('/users', async () => {
  const { parseBody } = useBody()
  const user = await parseBody<{ name: string }>()
  return { created: user.name }
})

app.listen(3000)
```

Available wooks: `useRequest()`, `useResponse()`, `useBody()`, `useCookies()`, `useSearchParams()`, `useAuthorization()`, and more. Plus `@wooksjs/http-static` for file serving and `@wooksjs/http-proxy` for reverse proxy.

[Get started with HTTP &rarr;](/webapp/)

## WebSocket

**Package:** `@wooksjs/event-ws` + `@wooksjs/ws-client`

Build real-time WebSocket servers with routed message handlers and composable state. Pair with the zero-dependency client for structured RPC, fire-and-forget messaging, rooms, and automatic reconnection.

```ts
import { createHttpApp } from '@wooksjs/event-http'
import { createWsApp, useWsMessage, useWsRooms } from '@wooksjs/event-ws'

const http = createHttpApp()
const ws = createWsApp(http)

http.upgrade('/ws', () => ws.upgrade())

ws.onMessage('message', '/chat/:room', () => {
  const { data } = useWsMessage<{ text: string }>()
  const { broadcast } = useWsRooms()
  broadcast('message', data)
})

http.listen(3000)
```

Available wooks: `useWsConnection()`, `useWsMessage()`, `useWsRooms()`, `useWsServer()`. HTTP composables (`useHeaders()`, `useCookies()`, etc.) work transparently via the upgrade request context.

[Get started with WebSocket &rarr;](/wsapp/)

## CLI

**Package:** `@wooksjs/event-cli`

Build command-line applications with routed commands, typed options, and auto-generated help — using the same wook patterns as HTTP.

```ts
import { createCliApp, useCliOption } from '@wooksjs/event-cli'

const app = createCliApp()

app.cli('deploy :env', () => {
  const { get } = useRouteParams<{ env: string }>()
  const verbose = useCliOption('verbose', { type: 'boolean' })
  return `Deploying to ${get('env')}...`
})

app.run()
```

Commands are registered with route-style patterns (`deploy/:env`). Options are parsed automatically. Help output is generated from command metadata via [@prostojs/cli-help](https://github.com/prostojs/cli-help).

[Get started with CLI &rarr;](/cliapp/)

## Workflows

**Package:** `@wooksjs/event-wf`

A declarative workflow engine for multi-step pipelines. Define steps and flows as data, and the engine handles execution, pausing, resuming, and state management.

```ts
import { createWfApp, useWfState } from '@wooksjs/event-wf'

const app = createWfApp<{ approved: boolean }>()

app.step('review', {
  input: 'approval',
  handler: () => {
    const { ctx, input } = useWfState()
    ctx<{ approved: boolean }>().approved = input<boolean>() ?? false
  },
})

app.flow('approval-process', [
  'validate',
  'review',
  { condition: 'approved', steps: ['notify-success'] },
  { condition: '!approved', steps: ['notify-rejection'] },
])
```

Workflows are **interruptible** — when a step needs input, the workflow pauses and returns serializable state. Resume it later with the input, minutes or days later.

[Get started with Workflows &rarr;](/wf/)

## Custom Adapters

You can build your own adapter for any event-driven scenario — job queues, message brokers, custom protocols. All adapters share the same `EventContext`, the same `defineWook`, the same primitives.

[Create a custom adapter &rarr;](/wooks/advanced/wooks-adapter)
