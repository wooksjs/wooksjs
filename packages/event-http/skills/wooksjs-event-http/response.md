# Response API — @wooksjs/event-http

> Status, headers, cookies, cache control, error handling, and response sending.

## Concepts

`useResponse()` returns an `HttpResponse` instance for the current request. All response operations — status, headers, cookies, cache control — are methods on this single object. Methods are chainable.

The response is also controlled implicitly by return values: returning an object sends JSON, returning a string sends text, returning nothing sends 204.

## API Reference

### `useResponse(ctx?): HttpResponse`

Returns the `HttpResponse` for the current request.

```ts
import { useResponse } from '@wooksjs/event-http'

const response = useResponse()
response.setStatus(200).setHeader('x-custom', 'value')
```

### Status

```ts
response.status = 201 // set via property
response.setStatus(201) // set via method (chainable)
const code = response.status // get current status
```

If not set explicitly, status is inferred automatically (see core.md Auto-status).

### Headers

```ts
response.setHeader('x-custom', 'value') // set a header (chainable)
response.setHeaders({ 'x-one': '1', 'x-two': '2' }) // batch-set headers
response.setHeader('x-multi', ['a', 'b']) // multi-value header
response.getHeader('x-custom') // get header value
response.removeHeader('x-custom') // remove a header (chainable)
response.headers() // all headers as Record
response.setContentType('application/xml') // shorthand for content-type
response.getContentType() // get content-type
response.enableCors('*') // set Access-Control-Allow-Origin (chainable)
```

### Cookies (outgoing)

Set-Cookie headers are managed via `HttpResponse`:

```ts
response.setCookie('session', 'abc123', {
  httpOnly: true,
  secure: true,
  sameSite: 'Strict',
  maxAge: 3600, // seconds (also accepts time strings)
  path: '/',
  domain: '.example.com',
  expires: new Date('2025-12-31'),
})

response.getCookie('session') // { value, attrs } or undefined
response.removeCookie('session')
response.clearCookies()
response.setCookieRaw('name=value; Path=/; HttpOnly') // raw Set-Cookie string
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

### Cache control

```ts
response.setCacheControl({
  public: true,
  maxAge: 3600,
  sMaxage: 7200,
  noStore: false,
  noCache: false,
  mustRevalidate: true,
})

response.setAge(300) // Age header (seconds)
response.setExpires(new Date('2025-12-31')) // Expires header
response.setExpires('2025-12-31') // also accepts strings
response.setPragmaNoCache() // Pragma: no-cache
```

### Body and content type inference

Return values are automatically serialized:

| Return type                      | Content-Type          | Status         |
| -------------------------------- | --------------------- | -------------- |
| `string`                         | `text/plain`          | Auto           |
| `number` / `boolean`             | `text/plain`          | Auto           |
| `object` / `array`               | `application/json`    | Auto           |
| `Buffer` / `Uint8Array`          | (none — set manually) | Auto           |
| `Readable` stream                | (none — set manually) | Auto           |
| `Response` (fetch)               | From fetch response   | Auto           |
| `undefined` / `null` / no return | —                     | 204 No Content |

### Raw response access

For escape hatches (SSE, WebSocket upgrades, etc.):

```ts
// Take full control — framework won't send anything
const res = response.getRawRes()
res.writeHead(200, { 'content-type': 'text/event-stream' })
res.write('data: hello\n\n')

// Passthrough — you write to res, but framework still finalizes
const res = response.getRawRes(true)
```

### `responded` property

```ts
if (response.responded) {
  // Response already sent — don't try to send again
}
```

## HttpError

For error responses, throw `HttpError`:

```ts
import { HttpError } from '@wooksjs/event-http'

throw new HttpError(404) // 404 with default message
throw new HttpError(400, 'Invalid email') // 400 with custom message
throw new HttpError(422, { message: 'Validation failed', fields: ['email'] }) // structured body
```

`HttpError` skips stack trace capture for performance (these are expected control-flow errors).

**Error rendering (`WooksHttpResponse`):**

The default response class renders errors based on the `Accept` header:

- `application/json` → JSON `{ statusCode, message, error }`
- `text/html` → Styled HTML error page with SVG icons
- `text/plain` → Plain text error

Override by providing a custom `responseClass` to `createHttpApp()`:

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

### Default headers and security headers

Pre-populate response headers for every request via `defaultHeaders`:

```ts
import { createHttpApp, securityHeaders } from '@wooksjs/event-http'

const app = createHttpApp({ defaultHeaders: securityHeaders() })
```

`securityHeaders(opts?)` returns recommended HTTP security headers:

| Header                         | Default                                                                           |
| ------------------------------ | --------------------------------------------------------------------------------- |
| `content-security-policy`      | `default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'` |
| `cross-origin-opener-policy`   | `same-origin`                                                                     |
| `cross-origin-resource-policy` | `same-origin`                                                                     |
| `referrer-policy`              | `no-referrer`                                                                     |
| `x-content-type-options`       | `nosniff`                                                                         |
| `x-frame-options`              | `SAMEORIGIN`                                                                      |

Options: `string` (override) or `false` (disable). `strictTransportSecurity` is opt-in only.

```ts
securityHeaders({
  contentSecurityPolicy: false,
  referrerPolicy: 'strict-origin-when-cross-origin',
  strictTransportSecurity: 'max-age=31536000; includeSubDomains',
})
```

Per-endpoint: `response.setHeaders(securityHeaders({ ... }))`.

## Common Patterns

### Pattern: Full response control

```ts
app.get('/data', () => {
  useResponse()
    .setStatus(200)
    .setHeader('x-request-id', useRequest().reqId())
    .setCookie('visited', 'true', { httpOnly: true })
    .setCacheControl({ public: true, maxAge: 3600 })

  return { data: 'hello' }
})
```

### Pattern: Redirect

```ts
app.get('/old-path', () => {
  useResponse().setStatus(301).setHeader('location', '/new-path')
})
```

### Pattern: Streaming response

```ts
import { createReadStream } from 'fs'

app.get('/file', () => {
  useResponse().setContentType('application/octet-stream')
  return createReadStream('/path/to/file')
})
```

### Pattern: Server-Sent Events

```ts
app.get('/events', () => {
  const res = useResponse().getRawRes()
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  })
  // Write events...
  return res // returning the raw response signals "already handled"
})
```

## Best Practices

- Return values for simple responses — only use `useResponse()` when you need headers, cookies, or explicit status
- Use `HttpError` for all error responses — don't manually set error status and body
- The chainable API means you can do `useResponse().setStatus(200).setHeader(...)` in one statement
- For custom error rendering, subclass `WooksHttpResponse` and override `renderError()`

## Gotchas

- Calling `send()` twice throws — check `response.responded` if unsure
- `getRawRes()` without `passthrough` marks the response as "responded" — the framework won't touch it
- `getRawRes(true)` (passthrough mode) lets you write headers/data while the framework still finalizes cookies and status
- Cookie `maxAge` is in seconds, not milliseconds
- `setContentType()` overwrites any previously set content-type
