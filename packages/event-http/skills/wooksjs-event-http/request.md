# Request Utilities — @wooksjs/event-http

> Covers composables for reading incoming request data: headers, cookies, query params, authorization, IP address, and Accept header.

## `useRequest()`

Primary composable for accessing the raw incoming HTTP request.

```ts
import { useRequest } from '@wooksjs/event-http'

app.get('/info', () => {
  const { method, url, headers, rawBody, reqId, getIp } = useRequest()

  return {
    method,          // 'GET'
    url,             // '/info?page=1'
    host: headers.host,
    ip: getIp(),
    requestId: reqId(),
  }
})
```

### Properties & methods

| Name | Type | Description |
|------|------|-------------|
| `rawRequest` | `IncomingMessage` | The raw Node.js request object |
| `method` | `string` | HTTP method (GET, POST, etc.) |
| `url` | `string` | Raw request URL including query string |
| `headers` | `IncomingHttpHeaders` | Request headers object |
| `rawBody()` | `() => Promise<Buffer>` | Lazily reads and decompresses the request body |
| `reqId()` | `() => string` | Lazily generates a UUID for this request |
| `getIp(opts?)` | `(opts?) => string` | Returns client IP (supports `trustProxy`) |
| `getIpList()` | `() => { remoteIp, forwarded }` | Returns all known IPs |
| `isCompressed()` | `() => boolean` | Whether the body is compressed |

### Body size limits

| Limit | Default | Description |
|-------|---------|-------------|
| `maxCompressed` | 1 MB (1 048 576) | Max compressed body size in bytes |
| `maxInflated` | 10 MB (10 485 760) | Max decompressed body size in bytes |
| `maxRatio` | 100 | Max compression ratio (zip-bomb protection) |
| `readTimeoutMs` | 10 000 | Body read timeout in milliseconds |

Limits can be set **app-wide** via `createHttpApp({ requestLimits: { ... } })` (see [core.md](core.md)) or **per-request** via the setters below (which override app defaults):

```ts
const {
  getMaxCompressed, setMaxCompressed,  // default: 1 MB
  getMaxInflated, setMaxInflated,      // default: 10 MB
  getMaxRatio, setMaxRatio,            // default: 100× (zip-bomb protection)
  getReadTimeoutMs, setReadTimeoutMs,  // default: 10s
} = useRequest()

// Override per-route for file uploads
setMaxCompressed(50 * 1024 * 1024)  // 50 MB
setMaxInflated(100 * 1024 * 1024)   // 100 MB
setMaxRatio(200)                    // allow 200× compression ratio
```

### IP address with proxy support

```ts
const { getIp } = useRequest()

// Direct connection IP
const ip = getIp()

// Trust X-Forwarded-For header (behind reverse proxy)
const clientIp = getIp({ trustProxy: true })
```

## `useHeaders()`

Returns incoming request headers directly:

```ts
import { useHeaders } from '@wooksjs/event-http'

app.get('/check', () => {
  const { host, authorization, 'content-type': contentType } = useHeaders()
  return { host, hasAuth: !!authorization }
})
```

Returns a standard `IncomingHttpHeaders` object (same as `req.headers`).

## `useSearchParams()`

Access URL query parameters (lazy-parsed, cached):

```ts
import { useSearchParams } from '@wooksjs/event-http'

app.get('/search', () => {
  const { urlSearchParams, jsonSearchParams, rawSearchParams } = useSearchParams()

  // URLSearchParams-like API
  const page = urlSearchParams().get('page')    // '1'
  const tags = urlSearchParams().getAll('tag')   // ['a', 'b']

  // As a plain object (handles repeated keys as arrays)
  const allParams = jsonSearchParams()  // { page: '1', tag: ['a', 'b'] }

  // Raw query string
  const raw = rawSearchParams()  // '?page=1&tag=a&tag=b'

  return { page, tags, allParams }
})
```

## `useCookies()`

Parse incoming request cookies (lazy per-cookie parsing):

```ts
import { useCookies } from '@wooksjs/event-http'

app.get('/dashboard', () => {
  const { getCookie, rawCookies } = useCookies()

  const session = getCookie('session_id')   // 'abc123' or null
  const theme = getCookie('theme')          // 'dark' or null

  return { session, theme }
})
```

Each cookie is parsed individually on first access and cached. If you never call `getCookie('theme')`, the `theme` cookie is never parsed.

## `useAuthorization()`

Parse the `Authorization` header (lazy, cached):

```ts
import { useAuthorization } from '@wooksjs/event-http'

app.get('/protected', () => {
  const { isBearer, isBasic, authType, authRawCredentials, basicCredentials } = useAuthorization()

  if (isBearer()) {
    const token = authRawCredentials()  // 'eyJhbGciOi...'
    // validate JWT
  }

  if (isBasic()) {
    const { username, password } = basicCredentials()!
    // validate credentials
  }

  return { authType: authType() }  // 'Bearer', 'Basic', etc.
})
```

### Methods

| Name | Returns | Description |
|------|---------|-------------|
| `authorization` | `string \| undefined` | Raw header value |
| `authType()` | `string \| null` | Auth scheme (Bearer, Basic, etc.) |
| `authRawCredentials()` | `string \| null` | Everything after the scheme |
| `isBearer()` | `boolean` | True if Bearer auth |
| `isBasic()` | `boolean` | True if Basic auth |
| `basicCredentials()` | `{ username, password } \| null` | Decoded Basic credentials |

## `useAccept()`

Check the `Accept` header for content negotiation:

```ts
import { useAccept } from '@wooksjs/event-http'

app.get('/data', () => {
  const { acceptsJson, acceptsHtml, acceptsXml, acceptsText, accepts } = useAccept()

  if (acceptsJson()) {
    return { data: 'json response' }
  }
  if (acceptsHtml()) {
    return '<html><body>HTML response</body></html>'
  }
  if (accepts('image/png')) {
    // custom MIME check
  }

  return 'plain text fallback'
})
```

## `useEventId()`

Generate a unique UUID for the current request (lazy, cached):

```ts
import { useEventId } from '@wooksjs/event-http'

app.get('/track', () => {
  const { getId } = useEventId()
  return { requestId: getId() }  // '550e8400-e29b-41d4-a716-446655440000'
})
```

The UUID is generated on first call to `getId()` and cached for the request lifetime.

## Best Practices

- **Use `useHeaders()` for raw header access**, `useAuthorization()` / `useCookies()` / `useAccept()` for parsed access. Don't manually parse headers when a composable exists.
- **Call `rawBody()` only once per request** — it reads the stream and returns a Buffer. The result is cached, so subsequent calls return the same promise.
- **Set limits before reading the body** — Call `setMaxCompressed()` etc. before `rawBody()` if you need non-default limits.
- **Use `getIp({ trustProxy: true })` only behind a trusted reverse proxy** — otherwise clients can spoof the `X-Forwarded-For` header.

## Gotchas

- `useHeaders()` returns the raw Node.js `IncomingHttpHeaders` where all header names are lowercase.
- `getCookie()` returns `null` (not `undefined`) when a cookie doesn't exist.
- `rawBody()` returns a `Promise<Buffer>`. If the body is compressed (gzip/deflate/br), it is automatically decompressed.
- Body reading has a 10-second timeout by default. If the client sends data slowly, you may need to increase it with `setReadTimeoutMs()`.
