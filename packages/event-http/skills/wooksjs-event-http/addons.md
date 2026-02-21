# Addons — Body Parser, Static Files, Proxy

> Covers the three official addon packages: `@wooksjs/http-body` for parsing request bodies, `@wooksjs/http-static` for serving static files, and `@wooksjs/http-proxy` for proxying requests.

## Body Parser — `@wooksjs/http-body`

### Installation

```bash
npm install @wooksjs/http-body
```

### `useBody()`

Composable that provides content-type detection and body parsing:

```ts
import { useBody } from '@wooksjs/http-body'

app.post('/api/data', async () => {
  const { parseBody, isJson, isFormData } = useBody()

  if (isJson()) {
    const data = await parseBody<{ name: string; age: number }>()
    return { received: data }
  }

  if (isFormData()) {
    const formData = await parseBody<Record<string, string>>()
    return { fields: formData }
  }

  return { error: 'Unsupported content type' }
})
```

### Content-type checkers

All checkers are lazy-computed and cached:

| Method | Checks for |
|--------|-----------|
| `isJson()` | `application/json` |
| `isHtml()` | `text/html` |
| `isXml()` | `text/xml` |
| `isText()` | `text/plain` |
| `isBinary()` | `application/octet-stream` |
| `isFormData()` | `multipart/form-data` |
| `isUrlencoded()` | `application/x-www-form-urlencoded` |

### `parseBody<T>()`

Parses the request body based on content type. Returns a promise. The result is cached — calling `parseBody()` twice returns the same promise.

| Content-Type | Parsed as |
|-------------|-----------|
| `application/json` | Parsed JSON object (safe parse with prototype pollution protection) |
| `multipart/form-data` | Parsed form fields as `Record<string, unknown>` |
| `application/x-www-form-urlencoded` | Parsed as object using `WooksURLSearchParams` |
| everything else | Raw text string |

### `rawBody()`

Also re-exports `rawBody()` from `useRequest()` for convenience:

```ts
const { rawBody } = useBody()
const buffer = await rawBody()  // Buffer (decompressed if needed)
```

### Common Pattern: JSON API endpoint

```ts
app.post('/api/users', async () => {
  const { parseBody, isJson } = useBody()
  if (!isJson()) throw new HttpError(415, 'Expected JSON')

  const body = await parseBody<{ name: string; email: string }>()
  const user = await db.createUser(body)

  const { status } = useResponse()
  status(201)
  return user
})
```

### Safety

- JSON parsing uses `safeJsonParse` which protects against `__proto__` and `constructor` pollution.
- Form-data parsing limits: max 255 fields, max 100-byte key names, max 100 KB per field value.
- Illegal keys (`__proto__`, `constructor`, `prototype`) are rejected with 400.

---

## Static Files — `@wooksjs/http-static`

### Installation

```bash
npm install @wooksjs/http-static
```

### `serveFile(filePath, options?)`

Serves a static file with full HTTP caching support (ETags, If-None-Match, If-Modified-Since, Range requests):

```ts
import { serveFile } from '@wooksjs/http-static'

app.get('/static/*', () => {
  const { get } = useRouteParams<{ '*': string }>()
  return serveFile(get('*'), {
    baseDir: './public',
    cacheControl: { maxAge: '1h', public: true },
  })
})
```

### Options

```ts
interface TServeFileOptions {
  baseDir?: string              // base directory for file resolution
  headers?: Record<string, string>  // additional response headers
  cacheControl?: TCacheControl  // Cache-Control directives
  expires?: Date | string | number  // Expires header
  pragmaNoCache?: boolean       // set Pragma: no-cache
  defaultExt?: string           // default extension (e.g. 'html')
  index?: string                // index file (e.g. 'index.html')
  listDirectory?: boolean       // serve directory listing
  allowDotDot?: boolean         // allow ../ traversal (default: false)
}
```

### Features

- **ETag & conditional requests**: Automatically generates ETags from inode/size/mtime. Returns 304 Not Modified when appropriate.
- **Range requests**: Supports `Range` header for partial content (206) and `If-Range` validation.
- **MIME type detection**: Automatically sets `Content-Type` based on file extension.
- **Directory listing**: Optional HTML directory listing with file sizes and dates.
- **Index files**: Serves `index.html` (or configured index) when a directory is requested.
- **Path traversal protection**: Rejects `../` by default.

### Common Pattern: SPA with fallback

```ts
app.get('/*', async () => {
  const { get } = useRouteParams<{ '*': string }>()
  try {
    return await serveFile(get('*') || 'index.html', {
      baseDir: './dist',
      index: 'index.html',
      cacheControl: { maxAge: '1d', public: true },
    })
  } catch {
    // Fallback to index.html for SPA client-side routing
    return await serveFile('index.html', { baseDir: './dist' })
  }
})
```

### Common Pattern: File server with directory listing

```ts
app.get('/files/*', () => {
  const { get } = useRouteParams<{ '*': string }>()
  return serveFile(get('*') || '.', {
    baseDir: '/var/shared',
    listDirectory: true,
    cacheControl: { noCache: true },
  })
})
```

---

## HTTP Proxy — `@wooksjs/http-proxy`

### Installation

```bash
npm install @wooksjs/http-proxy
```

### `useProxy()`

Composable that returns a `proxy()` function for forwarding the current request:

```ts
import { useProxy } from '@wooksjs/http-proxy'

app.get('/api/*', async () => {
  const proxy = useProxy()
  return await proxy('https://backend.example.com/api/endpoint', {
    reqHeaders: { allow: '*' },
    resHeaders: { allow: '*' },
  })
})
```

### `proxy(target, options?)`

The function returned by `useProxy()`:

```ts
async function proxy(target: string, opts?: TWooksProxyOptions): Promise<Response>
```

- `target` — Full URL to proxy to (including path and query string).
- Returns a `Response` (Fetch API) that the framework sends as the final response.

### Proxy Options

```ts
interface TWooksProxyOptions {
  method?: string               // override HTTP method
  reqHeaders?: TWooksProxyControls   // filter/transform request headers
  reqCookies?: TWooksProxyControls   // filter/transform request cookies
  resHeaders?: TWooksProxyControls   // filter/transform response headers
  resCookies?: TWooksProxyControls   // filter/transform response cookies
  debug?: boolean               // log proxy details
}
```

### Proxy Controls

Each control object (`TWooksProxyControls`) lets you allow, block, or overwrite headers/cookies:

```ts
interface TWooksProxyControls {
  allow?: Array<string | RegExp> | '*'   // allowlist (use '*' for all)
  block?: Array<string | RegExp> | '*'   // blocklist (use '*' for none)
  overwrite?: Record<string, string> | ((data: Record<string, string>) => Record<string, string>)
}
```

### Common Pattern: API Gateway

```ts
app.all('/api/*', async () => {
  const proxy = useProxy()
  const { get } = useRouteParams<{ '*': string }>()
  const { rawSearchParams } = useSearchParams()

  const targetPath = get('*')
  const query = rawSearchParams()
  const target = `https://internal-api.local/${targetPath}${query}`

  return await proxy(target, {
    reqHeaders: {
      allow: '*',
      overwrite: { 'x-gateway': 'wooks' },
    },
    resHeaders: { allow: '*' },
    reqCookies: { allow: ['session_id'] },
    resCookies: { allow: ['session_id'] },
  })
})
```

### Common Pattern: Selective header forwarding

```ts
return await proxy('https://api.example.com/data', {
  reqHeaders: {
    allow: ['authorization', 'content-type', 'accept'],
  },
  resHeaders: {
    allow: '*',
    block: ['x-internal-header', 'server'],
  },
})
```

### Blocked headers by default

When using proxy controls, these headers are blocked by default:

**Request**: `connection`, `accept-encoding`, `content-length`, `upgrade-insecure-requests`, `cookie`

**Response**: `transfer-encoding`, `content-encoding`, `set-cookie`

To forward cookies, explicitly configure `reqCookies` / `resCookies`.

### Debug mode

```ts
return await proxy('https://api.example.com/data', {
  debug: true,  // logs request/response details to the event logger
  reqHeaders: { allow: '*' },
  resHeaders: { allow: '*' },
})
```

## Best Practices

- **Always validate and sanitize paths before `serveFile()`** — Don't pass user input directly. Use `baseDir` to restrict the file root.
- **Use `parseBody()` only once** — It reads and caches the body. Multiple calls return the same cached result.
- **Use proxy controls to limit header forwarding** — Don't blindly forward all headers between services. Use `allow`/`block` to be explicit.
- **Set `allow: '*'` explicitly** — Without controls, no headers are forwarded by the proxy.

## Gotchas

- `serveFile()` throws `HttpError(404)` if the file doesn't exist. Catch it if you need fallback behavior.
- `serveFile()` rejects paths containing `/../` by default. Set `allowDotDot: true` only if you're certain the path is safe.
- `useProxy()` uses the global `fetch()` API — ensure your Node.js version supports it (18+).
- The proxy function returns a `Response` object. The framework handles streaming it to the client.
