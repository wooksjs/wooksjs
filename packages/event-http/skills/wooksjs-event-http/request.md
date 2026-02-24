# Request composables — @wooksjs/event-http

> Reading request data: headers, cookies, query params, body, authorization, IP address.

## Concepts

All request data is accessed through composables — functions that resolve context via `AsyncLocalStorage`. They take no arguments (optionally accept `ctx` for performance). Data is parsed lazily on first access and cached for the request lifetime.

All composables are importable from `@wooksjs/event-http`.

## API Reference

### `useRequest(ctx?)`

The primary request composable. Returns method, URL, headers, raw body, IP, and request limit controls.

```ts
import { useRequest } from '@wooksjs/event-http'

const { method, url, headers, rawBody, getIp, reqId } = useRequest()
```

**Returned properties:**

| Property | Type | Description |
|----------|------|-------------|
| `rawRequest` | `IncomingMessage` | Node.js raw request object |
| `url` | `string` | Request URL |
| `method` | `string` | HTTP method |
| `headers` | `IncomingHttpHeaders` | Request headers |
| `rawBody` | `() => Promise<Buffer>` | Lazy — reads and decompresses request body on call |
| `reqId` | `() => string` | Lazy UUID per request |
| `getIp(opts?)` | `(opts?: { trustProxy: boolean }) => string` | Client IP (with optional proxy trust) |
| `getIpList()` | `() => { remoteIp, forwarded[] }` | All IPs (remote + X-Forwarded-For) |
| `isCompressed()` | `() => boolean` | Whether the request body is compressed |

**Request limits (per-request override):**

```ts
const { setMaxCompressed, setMaxInflated, setMaxRatio, setReadTimeoutMs } = useRequest()
setMaxCompressed(5 * 1024 * 1024)  // 5 MB
setReadTimeoutMs(30_000)            // 30 seconds
```

Default limits: `maxCompressed: 1MB`, `maxInflated: 10MB`, `maxRatio: 100`, `readTimeoutMs: 10s`.

### `useHeaders(ctx?): IncomingHttpHeaders`

Returns request headers directly. Shorthand for `useRequest().headers`.

```ts
import { useHeaders } from '@wooksjs/event-http'

const { host, authorization, 'content-type': contentType } = useHeaders()
```

### `useCookies(ctx?)`

Parses incoming request cookies lazily (per cookie name, via `cachedBy`).

```ts
import { useCookies } from '@wooksjs/event-http'

const { getCookie, rawCookies } = useCookies()
const session = getCookie('session_id')   // parsed + cached
const theme = getCookie('theme')           // parsed + cached (different key)
const raw = rawCookies                     // raw Cookie header string
```

### `useSearchParams(ctx?)`

Provides access to URL query parameters.

```ts
import { useSearchParams } from '@wooksjs/event-http'

const { urlSearchParams, jsonSearchParams, rawSearchParams } = useSearchParams()

// URLSearchParams API
const page = urlSearchParams().get('page')
const tags = urlSearchParams().getAll('tag')

// As a plain object
const query = jsonSearchParams() // { page: '1', tag: ['a', 'b'] }

// Raw query string
const raw = rawSearchParams() // '?page=1&tag=a&tag=b'
```

### `useAuthorization(ctx?)`

Parses the Authorization header (supports Basic and Bearer).

```ts
import { useAuthorization } from '@wooksjs/event-http'

const { authorization, authType, authRawCredentials, isBearer, isBasic, basicCredentials } = useAuthorization()

if (isBearer()) {
  const token = authRawCredentials() // the raw token string
}

if (isBasic()) {
  const { username, password } = basicCredentials()!
}
```

**Returned properties:**

| Property | Type | Description |
|----------|------|-------------|
| `authorization` | `string \| undefined` | Raw Authorization header value |
| `authType()` | `string \| null` | Auth scheme: `'Basic'`, `'Bearer'`, etc. |
| `authRawCredentials()` | `string \| null` | Everything after the scheme |
| `isBasic()` | `boolean` | Whether it's Basic auth |
| `isBearer()` | `boolean` | Whether it's Bearer auth |
| `basicCredentials()` | `{ username, password } \| null` | Decoded Basic credentials |

### `useAccept(ctx?)`

Checks the request's `Accept` header for MIME type support.

```ts
import { useAccept } from '@wooksjs/event-http'

const { accept, accepts, acceptsJson, acceptsHtml, acceptsText, acceptsXml } = useAccept()

if (acceptsJson()) { /* ... */ }
if (accepts('image/png')) { /* ... */ }
```

### `useRouteParams<T>(ctx?)`

Route parameters from the URL. Re-exported from `@wooksjs/event-core`.

```ts
import { useRouteParams } from '@wooksjs/event-http'

// Given route: /users/:id/posts/:postId
const { params, get } = useRouteParams<{ id: string; postId: string }>()
params.id        // '42'
get('postId')    // '7'
```

### `useLogger(ctx?): Logger`

Logger from the current event context. Re-exported from `@wooksjs/event-core`.

```ts
import { useLogger } from '@wooksjs/event-http'

const log = useLogger()
log.info('handling request')
```

## Common Patterns

### Pattern: Auth guard with early return

```ts
app.post('/admin/action', async () => {
  const { isBearer, authRawCredentials } = useAuthorization()
  if (!isBearer()) throw new HttpError(401)

  const token = authRawCredentials()!
  const user = await verifyToken(token)
  if (!user.isAdmin) throw new HttpError(403)

  // Body is never parsed if auth fails
  const { parseBody } = useBody()
  return parseBody()
})
```

### Pattern: Performance — resolve context once

```ts
import { current } from '@wooksjs/event-core'

app.get('/hot-path', () => {
  const ctx = current()
  const { method } = useRequest(ctx)
  const { getCookie } = useCookies(ctx)
  const { urlSearchParams } = useSearchParams(ctx)
  // 1 ALS lookup instead of 3
})
```

## Best Practices

- Composables are lazy — call them only when you need the data
- Pass `ctx` explicitly in hot paths with multiple composable calls
- Use `getCookie(name)` over parsing all cookies when you need only a few
- `rawBody()` handles decompression (gzip, deflate, brotli) automatically with limits enforcement

## Gotchas

- `rawBody()` returns a `Promise<Buffer>` — always `await` it
- `rawBody()` consumes the stream — it's cached, so second call returns the same buffer
- `getCookie()` returns `null` (not `undefined`) when a cookie doesn't exist
- `useRequest()` limits setters use copy-on-write — they don't affect other requests
