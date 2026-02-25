# Testing — @wooksjs/event-ws

> Test helpers for creating mock WS contexts and running handler code outside a real server.

## Concepts

`@wooksjs/event-ws` provides test utilities that create fully initialized `EventContext` instances with mock WebSocket sockets. These let you unit-test composables and handler logic without starting a server or establishing real connections.

Two context types match the two context layers:

1. **Connection context** — for testing `onConnect`/`onDisconnect` handlers
2. **Message context** — for testing `onMessage` handlers (includes a parent connection context)

Each helper returns a **runner function** `<T>(cb: (...a: any[]) => T) => T` that executes a callback inside the scoped context.

## API Reference

### `prepareTestWsConnectionContext(options?)`

Creates a connection context with a mock `WsSocket`.

Options:

```ts
interface TTestWsConnectionContext {
  id?: string // default: 'test-conn-id'
  params?: Record<string, string | string[]> // pre-set route params
  parentCtx?: EventContext // optional parent (e.g., HTTP context)
}
```

Returns: `<T>(cb: (...a: any[]) => T) => T`

```ts
import { prepareTestWsConnectionContext } from '@wooksjs/event-ws'

const runInCtx = prepareTestWsConnectionContext({ id: 'conn-1' })

runInCtx(() => {
  const { id } = useWsConnection()
  expect(id).toBe('conn-1')
})
```

### `prepareTestWsMessageContext(options)`

Creates a message context with a parent connection context. Both contexts are fully seeded.

Options:

```ts
interface TTestWsMessageContext extends TTestWsConnectionContext {
  event: string // required
  path: string // required
  data?: unknown
  messageId?: string | number
  rawMessage?: Buffer | string // default: JSON.stringify of the message
}
```

Returns: `<T>(cb: (...a: any[]) => T) => T`

```ts
import { prepareTestWsMessageContext } from '@wooksjs/event-ws'

const runInCtx = prepareTestWsMessageContext({
  event: 'message',
  path: '/chat/lobby',
  data: { text: 'hello' },
  messageId: 42,
})

runInCtx(() => {
  const { data, id, path } = useWsMessage<{ text: string }>()
  expect(data.text).toBe('hello')
  expect(id).toBe(42)
  expect(path).toBe('/chat/lobby')
})
```

## Common Patterns

### Pattern: Testing composables with adapter state

When testing composables that access adapter state (`useWsConnection`, `useWsRooms`), you must set up the adapter state first:

```ts
import { setAdapterState } from '@wooksjs/event-ws/composables/state' // internal
import { WsRoomManager, WsConnection } from '@wooksjs/event-ws'

const connections = new Map<string, WsConnection>()
const roomManager = new WsRoomManager()
setAdapterState({
  connections,
  roomManager,
  serializer: JSON.stringify,
  wooks: {} as any,
})
```

Note: `setAdapterState` is an internal function — import it from the source in tests.

### Pattern: Testing with HTTP parent context

```ts
import { EventContext } from '@wooksjs/event-core'

const httpCtx = new EventContext({ logger: console as any })
// Seed httpCtx with HTTP-specific data if needed

const runInCtx = prepareTestWsMessageContext({
  event: 'test',
  path: '/test',
  parentCtx: httpCtx,
})

runInCtx(() => {
  const connCtx = currentConnection()
  expect(connCtx.parent).toBe(httpCtx)
})
```

### Pattern: Testing route params

```ts
const runInCtx = prepareTestWsMessageContext({
  event: 'message',
  path: '/chat/rooms/lobby',
  params: { roomId: 'lobby' },
  data: { text: 'hi' },
})

runInCtx(() => {
  const { params } = useRouteParams()
  expect(params.roomId).toBe('lobby')
})
```

## Best Practices

- Always use the test helpers rather than manually constructing `EventContext` — they ensure proper kind seeding
- Set up adapter state before testing composables that depend on it (`useWsConnection`, `useWsRooms`, `useWsServer`)
- Use `parentCtx` to simulate HTTP-integrated mode when testing composables that traverse the parent chain
- The mock `WsSocket` has no-op methods — if you need to assert on sent messages, create a custom mock and use `WsConnection` directly

## Gotchas

- The mock socket's `readyState` is set to `1` (OPEN) by default — `send()` calls will pass the guard check
- `prepareTestWsMessageContext` requires `event` and `path` — they are not optional
- Test contexts use `console` as the logger — override in `TTestWsConnectionContext` is not directly supported; wrap with a custom `EventContext` if needed
