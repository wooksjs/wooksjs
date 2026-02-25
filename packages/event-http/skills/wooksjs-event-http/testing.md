# Testing — @wooksjs/event-http

> Writing tests for handlers and composables with `prepareTestHttpContext`.

## Concepts

`prepareTestHttpContext` creates a fully initialized HTTP event context for testing. It sets up an `EventContext` with `httpKind` seeds (fake `IncomingMessage`, `HttpResponse`, route params, and optional pre-seeded body), then returns a runner function that executes callbacks inside the context scope.

## API Reference

### `prepareTestHttpContext(options): (cb) => T`

```ts
import { prepareTestHttpContext } from '@wooksjs/event-http'
```

**Options (`TTestHttpContext`):**

| Option           | Type                                 | Required | Description                                     |
| ---------------- | ------------------------------------ | -------- | ----------------------------------------------- |
| `url`            | `string`                             | Yes      | Request URL (e.g. `/api/users?page=1`)          |
| `method`         | `string`                             | No       | HTTP method (default: `'GET'`)                  |
| `headers`        | `Record<string, string>`             | No       | Request headers                                 |
| `params`         | `Record<string, string \| string[]>` | No       | Pre-set route parameters                        |
| `requestLimits`  | `TRequestLimits`                     | No       | Custom request limits                           |
| `rawBody`        | `string \| Buffer`                   | No       | Pre-seed the raw body (skips stream reading)    |
| `defaultHeaders` | `Record<string, string \| string[]>` | No       | Default headers to pre-populate on the response |

**Returns:** `(cb: () => T) => T` — a runner function.

```ts
const run = prepareTestHttpContext({
  url: '/users/42',
  method: 'GET',
  headers: { authorization: 'Bearer abc123' },
  params: { id: '42' },
})

run(() => {
  // All composables work here
  const { method } = useRequest()
  const { params } = useRouteParams()
  const { is } = useAuthorization()
  expect(method).toBe('GET')
  expect(params.id).toBe('42')
  expect(is('bearer')).toBe(true)
})
```

## Common Patterns

### Pattern: Testing a custom composable

```ts
import { describe, it, expect } from 'vitest'
import { prepareTestHttpContext, useHeaders } from '@wooksjs/event-http'
import { defineWook, cached } from '@wooksjs/event-core'

const useApiKey = defineWook((ctx) => {
  const headers = useHeaders(ctx)
  return {
    apiKey: headers['x-api-key'] as string | undefined,
    isValid: () => headers['x-api-key'] === 'secret',
  }
})

describe('useApiKey', () => {
  it('extracts API key from headers', () => {
    const run = prepareTestHttpContext({
      url: '/api/data',
      headers: { 'x-api-key': 'secret' },
    })

    run(() => {
      const { apiKey, isValid } = useApiKey()
      expect(apiKey).toBe('secret')
      expect(isValid()).toBe(true)
    })
  })
})
```

### Pattern: Testing body parsing

```ts
import { useBody } from '@wooksjs/http-body'

it('parses JSON body', async () => {
  const run = prepareTestHttpContext({
    url: '/api/users',
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    rawBody: JSON.stringify({ name: 'Alice' }),
  })

  await run(async () => {
    const { parseBody } = useBody()
    const body = await parseBody<{ name: string }>()
    expect(body.name).toBe('Alice')
  })
})
```

### Pattern: Testing response composable

```ts
it('sets response headers', () => {
  const run = prepareTestHttpContext({ url: '/test' })

  run(() => {
    const response = useResponse()
    response.setHeader('x-custom', 'value')
    response.setCookie('session', 'abc', { httpOnly: true })

    expect(response.getHeader('x-custom')).toBe('value')
    expect(response.getCookie('session')?.value).toBe('abc')
  })
})
```

### Pattern: Testing cookies

```ts
it('reads cookies from request', () => {
  const run = prepareTestHttpContext({
    url: '/dashboard',
    headers: { cookie: 'session=abc123; theme=dark' },
  })

  run(() => {
    const { getCookie } = useCookies()
    expect(getCookie('session')).toBe('abc123')
    expect(getCookie('theme')).toBe('dark')
    expect(getCookie('missing')).toBeNull()
  })
})
```

## Best Practices

- Always use `prepareTestHttpContext` — don't manually construct `EventContext` for HTTP tests
- Pre-seed `rawBody` for body parsing tests to avoid stream setup
- Pre-seed `params` to test route parameter logic without a router
- The runner function supports async callbacks — `await run(async () => { ... })`

## Gotchas

- `prepareTestHttpContext` uses a real `IncomingMessage` and `ServerResponse` (from `new Socket({})`) — they're functional but not connected to a network
- The `HttpResponse` in tests is the base `HttpResponse`, not `WooksHttpResponse` — error rendering won't do content negotiation
- `rawBody` pre-seeding stores a resolved Promise — `useRequest().rawBody()` returns immediately
