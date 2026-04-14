# @wooksjs/event-http — Response, Errors & Testing

## Table of Contents

1. [useResponse / HttpResponse](#useresponsectx-httpresponse)
2. [Status](#status)
3. [Headers](#headers)
4. [Cookies (Outgoing)](#cookies-outgoing)
5. [Cache Control](#cache-control)
6. [Body Content-Type Inference](#body-content-type-inference)
7. [Raw Response Access](#raw-response-access)
8. [HttpError and Error Rendering](#httperror-and-error-rendering)
9. [Streaming and SSE](#streaming-and-sse)
10. [Testing](#testing)
11. [Best Practices](#best-practices)
12. [Gotchas](#gotchas)

For app setup and routing, see [event-http.md](event-http.md).
For request composables, see [http-request.md](http-request.md).

---

## `useResponse(ctx?): HttpResponse`

Returns the `HttpResponse` for the current request. Methods are chainable.

```ts
const response = useResponse()
response.setStatus(200).setHeader('x-custom', 'value')
```

---

## Status

```ts
response.status = 201              // set via property
response.setStatus(201)            // set via method (chainable)
const code = response.status       // get current status
```

If not set explicitly, status is inferred via [auto-status table](event-http.md#auto-status-inference).

---

## Headers

```ts
response.setHeader('x-custom', 'value')           // set (chainable)
response.setHeaders({ 'x-one': '1', 'x-two': '2' }) // batch-set
response.setHeader('x-multi', ['a', 'b'])          // multi-value
response.getHeader('x-custom')                     // get value
response.removeHeader('x-custom')                  // remove (chainable)
response.headers()                                 // all headers as Record
response.setContentType('application/xml')         // shorthand
response.getContentType()                          // get content-type
response.enableCors('*')                           // Access-Control-Allow-Origin (chainable)
```

---

## Cookies (Outgoing)

Set-Cookie headers managed via `HttpResponse`:

```ts
response.setCookie('session', 'abc123', {
  httpOnly: true,
  secure: true,
  sameSite: 'Strict',
  maxAge: 3600,           // seconds (also accepts time strings)
  path: '/',
  domain: '.example.com',
  expires: new Date('2025-12-31'),
})

response.getCookie('session')        // { value, attrs } or undefined
response.removeCookie('session')
response.clearCookies()
response.setCookieRaw('name=value; Path=/; HttpOnly')
```

**`TCookieAttributes`:**

| Attribute  | Type                                     | Description        |
| ---------- | ---------------------------------------- | ------------------ |
| `expires`  | `Date \| string \| number`               | Expiration date    |
| `maxAge`   | `number \| TTimeMultiString`             | Max age in seconds |
| `domain`   | `string`                                 | Cookie domain      |
| `path`     | `string`                                 | Cookie path        |
| `secure`   | `boolean`                                | Secure flag        |
| `httpOnly` | `boolean`                                | HttpOnly flag      |
| `sameSite` | `boolean \| 'Lax' \| 'None' \| 'Strict'` | SameSite policy    |

---

## Cache Control

```ts
response.setCacheControl({
  public: true,
  maxAge: 3600,
  sMaxage: 7200,
  noStore: false,
  noCache: false,
  mustRevalidate: true,
})

response.setAge(300)                          // Age header (seconds)
response.setExpires(new Date('2025-12-31'))   // Expires header
response.setExpires('2025-12-31')             // also accepts strings
response.setPragmaNoCache()                   // Pragma: no-cache
```

---

## Body Content-Type Inference

| Return type                      | Content-Type          | Status         |
| -------------------------------- | --------------------- | -------------- |
| `string`                         | `text/plain`          | Auto           |
| `number` / `boolean`             | `text/plain`          | Auto           |
| `object` / `array`               | `application/json`    | Auto           |
| `Buffer` / `Uint8Array`          | (none -- set manually) | Auto          |
| `Readable` stream                | (none -- set manually) | Auto          |
| `Response` (fetch)               | From fetch response   | Auto           |
| `undefined` / `null` / no return | --                    | 204 No Content |

---

## Raw Response Access

For escape hatches (SSE, WebSocket upgrades, etc.):

```ts
// Full control -- framework will not send anything
const res = response.getRawRes()
res.writeHead(200, { 'content-type': 'text/event-stream' })
res.write('data: hello\n\n')

// Passthrough -- you write to res, framework still finalizes cookies and status
const res = response.getRawRes(true)
```

**`responded` property:** check `response.responded` before sending to avoid double-send errors.

---

## HttpError and Error Rendering

```ts
import { HttpError } from '@wooksjs/event-http'

throw new HttpError(404)                                      // default message
throw new HttpError(400, 'Invalid email')                     // custom message
throw new HttpError(422, { message: 'Validation failed', fields: ['email'] }) // structured body
```

`HttpError` skips stack trace capture (performance optimization for expected control-flow errors).

**Error rendering (`WooksHttpResponse`):** renders based on request `Accept` header:

- `application/json` -> JSON `{ statusCode, message, error }`
- `text/html` -> styled HTML error page with SVG icons
- `text/plain` -> plain text error

Override by subclassing `WooksHttpResponse`:

```ts
class MyResponse extends WooksHttpResponse {
  protected renderError(data, ctx) {
    this._status = data.statusCode
    this._headers['content-type'] = 'application/json'
    this._body = JSON.stringify({ error: data.message })
  }
}

const app = createHttpApp({ responseClass: MyResponse })
```

---

## Streaming and SSE

### Streaming Response

```ts
import { createReadStream } from 'fs'

app.get('/file', () => {
  useResponse().setContentType('application/octet-stream')
  return createReadStream('/path/to/file')
})
```

### Server-Sent Events

```ts
app.get('/events', () => {
  const res = useResponse().getRawRes()
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  })

  const interval = setInterval(() => {
    res.write(`data: ${JSON.stringify({ time: Date.now() })}\n\n`)
  }, 1000)

  res.on('close', () => clearInterval(interval))
  return res // returning raw response signals "already handled"
})
```

---

## Testing

### `prepareTestHttpContext(options): (cb) => T`

Create a fully initialized HTTP event context for testing. Sets up `EventContext` with `httpKind` seeds (fake `IncomingMessage`, `HttpResponse`, route params, optional pre-seeded body).

```ts
import { prepareTestHttpContext } from '@wooksjs/event-http'
```

**Options (`TTestHttpContext`):**

| Option           | Type                                 | Required | Description                                  |
| ---------------- | ------------------------------------ | -------- | -------------------------------------------- |
| `url`            | `string`                             | Yes      | Request URL (e.g. `/api/users?page=1`)       |
| `method`         | `string`                             | No       | HTTP method (default: `'GET'`)               |
| `headers`        | `Record<string, string>`             | No       | Request headers                              |
| `params`         | `Record<string, string \| string[]>` | No       | Pre-set route parameters                     |
| `requestLimits`  | `TRequestLimits`                     | No       | Custom request limits                        |
| `rawBody`        | `string \| Buffer`                   | No       | Pre-seed raw body (skips stream reading)     |
| `defaultHeaders` | `Record<string, string \| string[]>` | No       | Default headers to pre-populate on response  |

**Returns:** `(cb: () => T) => T` -- a runner that executes the callback inside the context scope.

### Testing a Custom Composable

```ts
import { describe, it, expect } from 'vitest'
import { prepareTestHttpContext, useHeaders } from '@wooksjs/event-http'
import { defineWook } from '@wooksjs/event-core'

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

### Testing Body Parsing

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

### Testing Response

```ts
it('sets response headers and cookies', () => {
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

### Testing Cookies

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

---

## Best Practices

- Use `useResponse()` only when explicit control over headers, cookies, or status is needed.
- Use `HttpError` for all error responses; do not manually set error status and body.
- Always use `prepareTestHttpContext` for tests; do not manually construct `EventContext`.
- Pre-seed `rawBody` for body parsing tests to avoid stream setup.
- Pre-seed `params` to test route parameter logic without a router.
- The test runner supports async callbacks: `await run(async () => { ... })`.
- For custom error rendering, subclass `WooksHttpResponse` and override `renderError()`.

---

## Gotchas

- Calling `send()` twice throws. Check `response.responded` if unsure.
- `getRawRes()` without `passthrough` marks the response as "responded"; the framework will not touch it.
- `getRawRes(true)` (passthrough mode) lets you write headers/data while the framework still finalizes cookies and status.
- Cookie `maxAge` is in seconds, not milliseconds.
- `setContentType()` overwrites any previously set content-type.
- `prepareTestHttpContext` uses a real `IncomingMessage` and `ServerResponse` (from `new Socket({})`). They are functional but not connected to a network.
- The `HttpResponse` in tests is the base `HttpResponse`, not `WooksHttpResponse`. Error rendering will not do content negotiation in tests.
- `rawBody` pre-seeding stores a resolved Promise. `useRequest().rawBody()` returns immediately.
