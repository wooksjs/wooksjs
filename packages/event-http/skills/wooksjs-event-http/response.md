# Response & Status — @wooksjs/event-http

> Covers setting status codes, response headers, outgoing cookies, cache control, and content type.

## Concepts

In Wooks, the response is built through composables rather than mutating the `res` object directly. You call `useResponse()`, `useSetHeaders()`, `useSetCookies()`, etc. to configure the response. All settings are collected in the context store and applied when the framework sends the response.

The framework automatically handles content type detection, serialization, and status code defaults. You only need to explicitly set these when you want non-default behavior.

## `useResponse()`

Core response composable for status codes and raw response access:

```ts
import { useResponse } from '@wooksjs/event-http'

app.post('/users', () => {
  const { status } = useResponse()
  status(201)  // Set status to 201 Created
  return { id: 1, name: 'Alice' }
})
```

### Properties & methods

| Name | Type | Description |
|------|------|-------------|
| `status(code?)` | `(code?) => EHttpStatusCode` | Get/set the response status code |
| `rawResponse(opts?)` | `(opts?) => ServerResponse` | Access the raw Node.js response |
| `hasResponded()` | `() => boolean` | True if response already sent |

### `status()` as a hookable function

The `status` function doubles as a hookable accessor:

```ts
const { status } = useResponse()

// Set status
status(404)

// Read status (call without args)
const currentStatus = status()

// Or use .value (hooked property)
status.value = 200
console.log(status.value)  // 200
```

### Raw response access

```ts
const { rawResponse } = useResponse()

// Passthrough mode: lets you write directly but still uses framework headers
const res = rawResponse({ passthrough: true })
res.write('chunk 1')

// Default mode: marks response as "handled", framework won't write again
const res2 = rawResponse()
res2.writeHead(200)
res2.end('done')
```

## `useStatus()`

Standalone status hook — returns a hookable accessor for the status code:

```ts
import { useStatus } from '@wooksjs/event-http'

app.get('/check', () => {
  const statusHook = useStatus()
  statusHook.value = 202
  return 'Accepted'
})
```

This is useful when a utility function needs to set the status without pulling in the full `useResponse()`.

### Type: `TStatusHook`

```ts
import type { TStatusHook } from '@wooksjs/event-http'

function myMiddleware(status: TStatusHook) {
  status.value = 403
}
```

## `useSetHeaders()`

Set outgoing response headers:

```ts
import { useSetHeaders } from '@wooksjs/event-http'

app.get('/data', () => {
  const { setHeader, setContentType, enableCors } = useSetHeaders()

  setHeader('x-request-id', '12345')
  setContentType('application/xml')
  enableCors('https://example.com')

  return '<data>hello</data>'
})
```

### Methods

| Name | Signature | Description |
|------|-----------|-------------|
| `setHeader` | `(name, value) => void` | Set a response header |
| `getHeader` | `(name) => string \| undefined` | Read a previously set header |
| `removeHeader` | `(name) => void` | Remove a set header |
| `setContentType` | `(value) => void` | Shortcut for `setHeader('content-type', value)` |
| `headers` | `() => Record<string, string>` | Get all set headers as an object |
| `enableCors` | `(origin?) => void` | Set `Access-Control-Allow-Origin` (default `*`) |

## `useSetHeader(name)`

Returns a hookable accessor for a single response header:

```ts
import { useSetHeader } from '@wooksjs/event-http'

const xRequestId = useSetHeader('x-request-id')
xRequestId.value = '12345'
console.log(xRequestId.value)     // '12345'
console.log(xRequestId.isDefined) // true
```

### Type: `THeaderHook`

```ts
import type { THeaderHook } from '@wooksjs/event-http'

function setCorrelationId(header: THeaderHook) {
  if (!header.isDefined) {
    header.value = generateId()
  }
}
```

## `useSetCookies()`

Set outgoing response cookies:

```ts
import { useSetCookies } from '@wooksjs/event-http'

app.post('/login', () => {
  const { setCookie, removeCookie, clearCookies } = useSetCookies()

  setCookie('session_id', 'abc123', {
    httpOnly: true,
    secure: true,
    sameSite: 'Strict',
    maxAge: '7d',  // supports time strings like '1h', '30m', '7d'
    path: '/',
  })

  return { success: true }
})
```

### Methods

| Name | Signature | Description |
|------|-----------|-------------|
| `setCookie` | `(name, value, attrs?) => void` | Set a response cookie |
| `getCookie` | `(name) => TSetCookieData \| undefined` | Read a previously set cookie |
| `removeCookie` | `(name) => void` | Remove a set cookie |
| `clearCookies` | `() => void` | Remove all set cookies |
| `cookies` | `() => string[]` | Render all cookies as Set-Cookie header strings |

### Cookie Attributes

```ts
interface TCookieAttributes {
  expires: Date | string | number       // expiration date
  maxAge: number | TTimeMultiString     // max age (seconds or time string)
  domain: string                        // cookie domain
  path: string                          // cookie path
  secure: boolean                       // HTTPS only
  httpOnly: boolean                     // no JS access
  sameSite: boolean | 'Lax' | 'None' | 'Strict'
}
```

Time strings (`TTimeMultiString`) support formats like `'1h'`, `'30m'`, `'7d'`, `'1y'`.

## `useSetCookie(name)`

Hookable accessor for a single outgoing cookie:

```ts
import { useSetCookie } from '@wooksjs/event-http'

const sessionCookie = useSetCookie('session_id')

// Set value
sessionCookie.value = 'abc123'

// Set attributes
sessionCookie.attrs = { httpOnly: true, secure: true }

// Read
console.log(sessionCookie.value)  // 'abc123'
console.log(sessionCookie.attrs)  // { httpOnly: true, secure: true }
```

### Type: `TCookieHook`

```ts
import type { TCookieHook } from '@wooksjs/event-http'

function enforceSecureCookie(cookie: TCookieHook) {
  cookie.attrs = { ...cookie.attrs, secure: true, httpOnly: true }
}
```

## `useSetCacheControl()`

Set cache-related response headers:

```ts
import { useSetCacheControl } from '@wooksjs/event-http'

app.get('/assets/:file', () => {
  const { setCacheControl, setExpires, setAge, setPragmaNoCache } = useSetCacheControl()

  setCacheControl({
    maxAge: 3600,
    public: true,
    noTransform: true,
  })

  // Or set individual cache headers
  setAge(300)                   // Age: 300
  setExpires(new Date('2025-12-31'))  // Expires: Wed, 31 Dec 2025 ...
  setPragmaNoCache()            // Pragma: no-cache

  return serveFile(...)
})
```

### Cache-Control Directives

```ts
interface TCacheControl {
  maxAge?: number | TTimeMultiString
  sMaxage?: number | TTimeMultiString
  noCache?: boolean
  noStore?: boolean
  noTransform?: boolean
  mustRevalidate?: boolean
  proxyRevalidate?: boolean
  public?: boolean
  private?: boolean
  immutable?: boolean
  staleWhileRevalidate?: number | TTimeMultiString
  staleIfError?: number | TTimeMultiString
}
```

## Content Type Auto-Detection

The framework automatically sets the content type based on the handler return value:

| Return type | Content-Type |
|-------------|-------------|
| `string` | `text/plain` |
| `number` | `text/plain` |
| `boolean` | `text/plain` |
| `object` / `array` | `application/json` |
| `Readable` stream | (must set manually) |
| `undefined` | (no body, 204) |

Override by calling `setContentType()` before returning:

```ts
app.get('/html', () => {
  const { setContentType } = useSetHeaders()
  setContentType('text/html')
  return '<h1>Hello</h1>'
})
```

## Common Patterns

### Pattern: JSON API Response

```ts
app.get('/api/users/:id', async () => {
  const { get } = useRouteParams<{ id: string }>()
  const user = await db.findUser(get('id'))
  if (!user) throw new HttpError(404, 'User not found')
  return user  // auto-serialized as JSON with 200
})
```

### Pattern: File Download

```ts
app.get('/download/:file', () => {
  const { setHeader } = useSetHeaders()
  const { get } = useRouteParams<{ file: string }>()
  setHeader('content-disposition', `attachment; filename="${get('file')}"`)
  return createReadStream(`/uploads/${get('file')}`)
})
```

### Pattern: Redirect

```ts
import { BaseHttpResponse } from '@wooksjs/event-http'

app.get('/old-page', () => {
  return new BaseHttpResponse().setStatus(302).setHeader('location', '/new-page')
})
```

## Best Practices

- **Let the framework auto-detect content type** — Only call `setContentType()` when you need a non-default type.
- **Use `useSetCookies()` for multiple cookies, `useSetCookie(name)` for hookable access to a single cookie**.
- **Set status before returning** — If you need a custom status, call `status(code)` before the handler returns.
- **Use time strings for maxAge** — `'7d'` is clearer than `604800`.

## Gotchas

- If you call `rawResponse()` without `{ passthrough: true }`, the framework marks the response as sent and won't write anything else.
- Headers set via `useSetHeaders()` are merged with any `BaseHttpResponse` headers. The `BaseHttpResponse` headers take precedence on collision.
- Cookies set via `useSetCookies()` are merged with `BaseHttpResponse.setCookie()` cookies.
