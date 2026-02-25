# Testing

::: warning Experimental
This package is in an experimental phase. The API may change without following semver until it reaches a stable release.
:::

`@wooksjs/event-ws` provides test context utilities that let you run handler logic in isolation — without a real WebSocket connection or HTTP server.

[[toc]]

## Test Utilities

### prepareTestWsMessageContext

Creates a message context runner for testing `onMessage` handlers. Returns a function that executes a callback inside the context.

```ts
import { prepareTestWsMessageContext, useWsMessage, useWsConnection } from '@wooksjs/event-ws'

const run = prepareTestWsMessageContext({
  event: 'message',
  path: '/chat/general',
  data: { text: 'hello', from: 'Alice' },
  messageId: 42,
})

run(() => {
  const { data, id, path, event } = useWsMessage<{ text: string; from: string }>()
  expect(data.text).toBe('hello')
  expect(data.from).toBe('Alice')
  expect(id).toBe(42)
  expect(path).toBe('/chat/general')
  expect(event).toBe('message')
})
```

#### Options

```ts
interface TTestWsMessageContext {
  event: string                                  // Required: event type
  path: string                                   // Required: message path
  data?: unknown                                 // Message payload
  messageId?: string | number                    // Correlation ID
  rawMessage?: Buffer | string                   // Raw message data
  id?: string                                    // Connection ID (default: 'test-conn-id')
  params?: Record<string, string | string[]>     // Route params
  parentCtx?: EventContext                       // Optional parent (HTTP) context
}
```

### prepareTestWsConnectionContext

Creates a connection context runner for testing `onConnect` / `onDisconnect` handlers.

```ts
import { prepareTestWsConnectionContext, useWsConnection } from '@wooksjs/event-ws'

const run = prepareTestWsConnectionContext({
  id: 'test-connection-123',
})

run(() => {
  const { id } = useWsConnection()
  expect(id).toBe('test-connection-123')
})
```

#### Options

```ts
interface TTestWsConnectionContext {
  id?: string                                    // Connection ID (default: 'test-conn-id')
  params?: Record<string, string | string[]>     // Route params
  parentCtx?: EventContext                       // Optional parent (HTTP) context
}
```

## Testing with Route Params

```ts
const run = prepareTestWsMessageContext({
  event: 'message',
  path: '/chat/general',
  data: { text: 'hello' },
  params: { room: 'general' },
})

run(() => {
  const { get } = useRouteParams<{ room: string }>()
  expect(get('room')).toBe('general')
})
```

## Testing with HTTP Parent Context

To test composables that read from the HTTP upgrade request (like `useCookies()`, `useHeaders()`), provide a parent context:

```ts
import { prepareTestHttpContext } from '@wooksjs/event-http'
import { prepareTestWsMessageContext, useWsMessage } from '@wooksjs/event-ws'
import { useCookies } from '@wooksjs/event-http'

// Create an HTTP context to act as the parent
const httpRun = prepareTestHttpContext({
  url: '/ws',
  method: 'GET',
  headers: { cookie: 'session=abc123' },
})

httpRun((httpCtx) => {
  // Create a WS message context with the HTTP context as parent
  const wsRun = prepareTestWsMessageContext({
    event: 'query',
    path: '/me',
    parentCtx: httpCtx,
  })

  wsRun(() => {
    // HTTP composables resolve through the parent chain
    const { getCookie } = useCookies()
    expect(getCookie('session')).toBe('abc123')
  })
})
```

## Example: Testing a Message Handler

```ts
import { describe, it, expect } from 'vitest'
import { prepareTestWsMessageContext, useWsMessage, WsError } from '@wooksjs/event-ws'

// The handler under test
function joinHandler() {
  const { data } = useWsMessage<{ name: string }>()
  if (!data?.name) {
    throw new WsError(400, 'Name is required')
  }
  return { joined: true, name: data.name }
}

describe('join handler', () => {
  it('returns joined status', () => {
    const run = prepareTestWsMessageContext({
      event: 'join',
      path: '/chat/general',
      data: { name: 'Alice' },
      messageId: 1,
    })

    const result = run(() => joinHandler())
    expect(result).toEqual({ joined: true, name: 'Alice' })
  })

  it('throws on missing name', () => {
    const run = prepareTestWsMessageContext({
      event: 'join',
      path: '/chat/general',
      data: {},
      messageId: 2,
    })

    expect(() => run(() => joinHandler())).toThrow(WsError)
  })
})
```
