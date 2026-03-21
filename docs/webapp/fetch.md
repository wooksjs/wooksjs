# Programmatic Fetch

Invoke route handlers in-process using the Web Standard `Request`/`Response` API — no TCP connection, no serialization overhead. The full dispatch pipeline runs: route matching, context creation, composables, error handling.

[[toc]]

## Why

Server-side rendering (SSR), in-process API calls, and testing all need to call route handlers programmatically. Without `fetch()`, the only options are:

- **Loopback HTTP request** — wasteful TCP round-trip for an in-process call
- **Calling handlers directly** — bypasses the entire Wooks pipeline (routing, composables, error handling)
- **Duplicating logic** in a separate service layer

`fetch()` and `request()` solve this by exposing the application as a `(Request) → Response` function — the same pattern used by Hono, H3/Nitro, and Bun.

## Basic Usage

### `app.request()`

The convenience method for most use cases. Accepts a URL string (relative paths auto-prefixed with `http://localhost`), plus optional `RequestInit`:

```ts
import { createHttpApp } from '@wooksjs/event-http'

const app = createHttpApp()

app.get('/api/users', () => {
  return [{ id: 1, name: 'Alice' }]
})

// Programmatic invocation — full pipeline, zero TCP
const res = await app.request('/api/users')
const users = await res.json()
// [{ id: 1, name: 'Alice' }]
```

POST with body:

```ts
const res = await app.request('/api/users', {
  method: 'POST',
  body: JSON.stringify({ name: 'Bob' }),
  headers: { 'content-type': 'application/json' },
})
```

### `app.fetch()`

Accepts a full Web Standard `Request` object. Use this when you need complete control over the request:

```ts
const res = await app.fetch(
  new Request('http://localhost/api/users', {
    method: 'POST',
    body: JSON.stringify({ name: 'Bob' }),
    headers: { 'content-type': 'application/json' },
  })
)
```

Both methods return a standard `Response` object with status, headers, and body.

## SSR Header Forwarding

When `fetch()` is called from within an existing HTTP handler (e.g., during SSR), identity headers are **automatically forwarded** from the calling request to the programmatic request. This means the inner API call sees the same user session as the page request — no manual header copying needed.

```ts
import { useAuthorization } from '@wooksjs/event-http'

app.get('/dashboard', async () => {
  // The user's authorization and cookie headers are
  // automatically forwarded to this inner call
  const res = await app.request('/api/user-data')
  const data = await res.json()
  return renderPage(data)
})

app.get('/api/user-data', () => {
  // useAuthorization() sees the original user's Bearer token
  const { credentials } = useAuthorization()
  return fetchUserData(credentials())
})
```

### Default Forwarded Headers

By default, the following headers are forwarded:

- `authorization` — auth identity (Bearer tokens, Basic auth)
- `cookie` — session state
- `accept-language` — user's language preference
- `x-forwarded-for` — client IP chain
- `x-request-id` — request tracing

### Customizing Header Forwarding

Configure globally via `createHttpApp` options:

```ts
// Forward only specific headers
const app = createHttpApp({
  forwardHeaders: ['authorization', 'cookie', 'x-custom-auth'],
})

// Disable forwarding entirely
const app = createHttpApp({
  forwardHeaders: false,
})
```

### Header Precedence

Headers explicitly set on the programmatic request **always override** forwarded headers:

```ts
app.get('/page', async () => {
  // Even though the page request has authorization,
  // the inner call uses the explicitly provided override
  const res = await app.request('/api/data', {
    headers: { authorization: 'Bearer service-token' },
  })
  return res.json()
})
```

## Cookie Propagation

When an inner API call sets cookies (e.g., refreshing a session token), those cookies are **automatically propagated** to the outer response. This ensures cookies reach the browser even when set by an inner programmatic call during SSR:

```ts
import { useResponse } from '@wooksjs/event-http'

app.get('/dashboard', async () => {
  // If /api/auth/refresh sets a new session cookie,
  // it will appear on the /dashboard response sent to the browser
  await app.request('/api/auth/refresh')
  return renderDashboard()
})

app.get('/api/auth/refresh', () => {
  const response = useResponse()
  response.setCookie('session', newToken, { httpOnly: true })
  return { ok: true }
})
```

Cookies from multiple inner calls are all collected on the outer response.

## Response Isolation

Each `fetch()` invocation creates a fully isolated context. The inner response's status code, headers (except propagated cookies), and body do not affect the outer response:

```ts
app.get('/page', async () => {
  const inner = await app.request('/api/might-fail')

  // Inner 404 does not make the page 404
  if (inner.status === 404) {
    return renderNotFound()
  }

  return renderPage(await inner.json())
})
```

Route parameters, URL, method, and all composables are scoped to each invocation.

## Performance Optimizations

### `json()` — Zero-Cost Deserialization

When a handler returns a plain object, `response.json()` returns the **original object reference** — no `JSON.stringify` → `JSON.parse` round-trip:

```ts
app.get('/api/data', () => {
  return { users: [{ id: 1 }], total: 1 }
})

const res = await app.request('/api/data')
const data = await res.json()
// `data` is the exact same object the handler returned — not a parsed copy
```

### `text()` — Direct String Access

For string responses, `response.text()` returns the pre-computed string directly without reading the body stream:

```ts
app.get('/greeting', () => 'Hello World!')

const res = await app.request('/greeting')
const text = await res.text()  // returns the string directly
```

## Raw ServerResponse Access

Handlers that call `getRawRes()` and write directly to the Node.js `ServerResponse` work during programmatic fetch. Writes are intercepted and captured into the Web `Response`:

```ts
import { useResponse } from '@wooksjs/event-http'

app.get('/raw', () => {
  const res = useResponse().getRawRes()
  res.writeHead(200, { 'content-type': 'text/plain', 'x-custom': 'value' })
  res.write('chunk 1')
  res.end('chunk 2')
})

const res = await app.request('/raw')
await res.text()  // 'chunk 1chunk 2'
res.headers.get('x-custom')  // 'value'
```

::: warning Limitations of raw access
When using `getRawRes()` during programmatic fetch:
- **Cookie propagation** to the parent SSR response does not work — cookies written via `writeHead` are captured on the inner response but not auto-propagated. Use `response.setCookie()` instead for SSR-compatible cookie handling.
- **`json()` / `text()` optimizations** do not apply — the response body is captured as raw bytes.
:::

## Limitations

### Body is Read Eagerly

The request body is fully read into memory before the handler runs. This is fine for typical API payloads (JSON, form data) but not suitable for streaming large file uploads via `fetch()`.
