# Testing

`@wooksjs/event-http` provides two approaches for testing: **programmatic fetch** for integration tests (full pipeline) and **test context** for unit tests (composable isolation).

[[toc]]

## Integration Testing with `fetch()` / `request()`

The recommended approach for testing routes end-to-end. No HTTP server, no TCP overhead — the full dispatch pipeline runs in-process:

```ts
import { describe, it, expect } from 'vitest'
import { createHttpApp, useRequest, useResponse, HttpError } from '@wooksjs/event-http'
import { useRouteParams } from '@wooksjs/event-core'
import { Wooks } from 'wooks'

describe('Users API', () => {
  const app = createHttpApp(undefined, new Wooks())

  app.get('/api/users/:id', () => {
    const { params } = useRouteParams()
    return { id: params.id }
  })

  app.post('/api/users', async () => {
    const { rawBody } = useRequest()
    const body = JSON.parse((await rawBody()).toString())
    return { created: true, name: body.name }
  })

  it('resolves route params', async () => {
    const res = await app.request('/api/users/42')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: '42' })
  })

  it('reads POST body', async () => {
    const res = await app.request('/api/users', {
      method: 'POST',
      body: JSON.stringify({ name: 'Alice' }),
      headers: { 'content-type': 'application/json' },
    })
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ created: true, name: 'Alice' })
  })

  it('returns null for unknown routes', async () => {
    const res = await app.request('/api/nope')
    expect(res).toBeNull()
  })

  it('captures response headers and cookies', async () => {
    app.get('/api/with-headers', () => {
      const response = useResponse()
      response.setHeader('x-custom', 'value')
      response.setCookie('session', 'tok')
      return 'ok'
    })

    const res = await app.request('/api/with-headers')
    expect(res.headers.get('x-custom')).toBe('value')
    expect(res.headers.getSetCookie()[0]).toContain('session=tok')
  })

  it('handles errors', async () => {
    app.get('/api/forbidden', () => {
      throw new HttpError(403, 'Access denied')
    })

    const res = await app.request('/api/forbidden')
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.message).toBe('Access denied')
  })
})
```

::: tip Isolated Router
Pass a `new Wooks()` as the second argument to `createHttpApp()` so each test suite gets its own router. Without this, all suites share a global singleton and routes can collide:
```ts
import { Wooks } from 'wooks'
const app = createHttpApp(undefined, new Wooks())
```
:::

### Testing SSR Flows

Test nested programmatic calls to verify header forwarding and cookie propagation:

```ts
import { useAuthorization, useResponse } from '@wooksjs/event-http'

it('forwards auth to inner API calls', async () => {
  app.get('/page', async () => {
    const inner = await app.request('/api/me')
    return inner.json()
  })
  app.get('/api/me', () => {
    const { authorization } = useAuthorization()
    return { auth: authorization }
  })

  const res = await app.request('/page', {
    headers: { authorization: 'Bearer tok123' },
  })
  expect(await res.json()).toEqual({ auth: 'Bearer tok123' })
})

it('propagates cookies from inner calls to outer response', async () => {
  app.get('/page', async () => {
    await app.request('/api/refresh')
    return 'page content'
  })
  app.get('/api/refresh', () => {
    useResponse().setCookie('session', 'new-token')
    return 'ok'
  })

  const res = await app.request('/page')
  expect(res.headers.getSetCookie()[0]).toContain('session=new-token')
})
```

## Unit Testing with `prepareTestHttpContext`

For testing composables in isolation — without routing or response rendering:

```ts
import { prepareTestHttpContext } from '@wooksjs/event-http'
import { useRequest, useCookies, useAuthorization } from '@wooksjs/event-http'

const run = prepareTestHttpContext({
  url: '/api/users/42?page=2',
  method: 'GET',
  headers: {
    authorization: 'Bearer tok123',
    cookie: 'session=abc',
  },
  params: { id: '42' },
})

run(() => {
  const { method, url } = useRequest()
  expect(method).toBe('GET')
  expect(url).toBe('/api/users/42?page=2')

  const { getCookie } = useCookies()
  expect(getCookie('session')).toBe('abc')

  const { credentials } = useAuthorization()
  expect(credentials()).toBe('tok123')
})
```

### Options

```ts
interface TTestHttpContext {
  url: string                                    // Request URL (e.g. '/api/users?page=1')
  method?: string                                // HTTP method (default: 'GET')
  headers?: Record<string, string>               // Request headers
  params?: Record<string, string | string[]>     // Pre-set route parameters
  rawBody?: string | Buffer                      // Pre-seed request body
  requestLimits?: TRequestLimits                 // Custom body size limits
  defaultHeaders?: Record<string, string | string[]>  // Pre-populate response headers
}
```

### Testing Body Parsing

```ts
const run = prepareTestHttpContext({
  url: '/api/data',
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  rawBody: JSON.stringify({ name: 'Alice' }),
})

run(async () => {
  const { rawBody } = useRequest()
  const body = JSON.parse((await rawBody()).toString())
  expect(body.name).toBe('Alice')
})
```

## When to Use Which

| Approach | Use Case | Runs routing? | Runs response rendering? |
|----------|----------|:---:|:---:|
| `app.request()` / `app.fetch()` | Integration tests, SSR flows | Yes | Yes |
| `prepareTestHttpContext()` | Unit tests for composables | No | No |
