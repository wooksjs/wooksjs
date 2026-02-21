# Core Concepts — @wooksjs/event-http

> Covers HTTP app creation, server setup, how the HTTP adapter integrates with the event context system, testing, and logging.

For the underlying event context store API (`init`, `get`, `set`, `hook`, etc.) and how to create custom composables, see [event-core.md](event-core.md).

## Mental Model

`@wooksjs/event-http` is the HTTP adapter for Wooks. It turns every incoming HTTP request into an event with its own isolated context store. Instead of middleware chains and mutated `req`/`res` objects, you call composable functions (`useRequest()`, `useCookies()`, `useSetHeaders()`, etc.) from anywhere in your handler — values are computed on demand and cached per request.

Key principles:
1. **Never mutate `req`** — Accumulate request context in the store instead.
2. **Never parse before needed** — Cookies, body, search params are only parsed when a composable is first called.
3. **No middleware sprawl** — Composable functions replace middleware. Each one is a focused, importable utility.

## Installation

```bash
npm install wooks @wooksjs/event-http
```

## Creating an HTTP App

```ts
import { createHttpApp } from '@wooksjs/event-http'

const app = createHttpApp()

app.get('/hello', () => 'Hello World!')

app.listen(3000, () => {
  console.log('Server running on port 3000')
})
```

`createHttpApp(opts?, wooks?)` returns a `WooksHttp` instance. Options:

```ts
interface TWooksHttpOptions {
  logger?: TConsoleBase          // custom logger
  eventOptions?: TEventOptions   // event-level logger config
  onNotFound?: TWooksHandler     // custom 404 handler
  router?: {
    ignoreTrailingSlash?: boolean // treat /path and /path/ as the same
    ignoreCase?: boolean         // case-insensitive matching
    cacheLimit?: number          // max cached parsed routes
  }
  requestLimits?: {              // app-level body limits (overridable per-request)
    maxCompressed?: number       // default: 1 MB
    maxInflated?: number         // default: 10 MB
    maxRatio?: number            // default: 100 (zip-bomb protection)
    readTimeoutMs?: number       // default: 10 000 ms
  }
}
```

Example — raise body limits for the entire app:

```ts
const app = createHttpApp({
  requestLimits: {
    maxCompressed: 50 * 1024 * 1024,  // 50 MB
    maxInflated: 100 * 1024 * 1024,   // 100 MB
    maxRatio: 200,
  },
})
```

These defaults apply to every request but can still be overridden per-request via `useRequest()` (see [request.md](request.md)).

## Using with an Existing Node.js Server

```ts
import http from 'http'
import { createHttpApp } from '@wooksjs/event-http'

const app = createHttpApp()
app.get('/hello', () => 'Hello World!')

const server = http.createServer(app.getServerCb())
server.listen(3000)
```

## How HTTP Context Works

When a request arrives, the adapter creates an HTTP-specific event context:

```
Request arrives (req, res)
  → createHttpContext({ req, res }, options)
    → AsyncLocalStorage.run(httpContextStore, handler)
      → router matches path → handler runs
        → handler calls useRequest(), useCookies(), etc.
          → each composable calls useHttpContext()
            → reads/writes the HTTP context store via init(), get(), set()
```

### The HTTP Context Store

The HTTP adapter extends the base event context with these sections:

```ts
interface THttpContextStore {
  searchParams?: TSearchParamsCache               // cached query params
  cookies?: Record<string, string | null>          // cached parsed cookies
  setCookies?: Record<string, TSetCookieData>      // outgoing response cookies
  accept?: Record<string, boolean>                 // cached Accept header checks
  authorization?: TAuthCache                       // cached auth header parsing
  setHeader?: Record<string, string | string[]>    // outgoing response headers
  request?: TRequestCache                          // cached request data (body, IP, etc.)
  response?: { responded: boolean }                // response sent flag
  status?: { code: EHttpStatusCode }               // response status code
}
```

Every section is lazily initialized — it only exists when a composable first writes to it. This means zero overhead for unused features.

### Extending the HTTP Store for Custom Composables

When creating custom composables for HTTP, extend the store type via the generic parameter on `useHttpContext`:

```ts
import { useHttpContext } from '@wooksjs/event-http'

interface TMyStore {
  myFeature?: {
    parsedToken?: { userId: string; role: string } | null
    isAdmin?: boolean
  }
}

export function useMyFeature() {
  const { store } = useHttpContext<TMyStore>()
  const { init } = store('myFeature')

  const parsedToken = () =>
    init('parsedToken', () => {
      const { authRawCredentials, isBearer } = useAuthorization()
      if (!isBearer()) return null
      return decodeToken(authRawCredentials()!)
    })

  const isAdmin = () =>
    init('isAdmin', () => parsedToken()?.role === 'admin')

  return { parsedToken, isAdmin }
}
```

For the full context store API and more composable patterns, see [event-core.md](event-core.md).

## Server Lifecycle

### `listen(...)`

Starts a built-in HTTP server:

```ts
await app.listen(3000)
await app.listen(3000, '0.0.0.0')
await app.listen({ port: 3000, host: '0.0.0.0' })
```

### `close(server?)`

Stops the server:

```ts
await app.close()
```

### `getServer()`

Returns the underlying `http.Server` instance (only available after `listen()`):

```ts
const server = app.getServer()
```

### `attachServer(server)`

Attaches an external server so `close()` can stop it:

```ts
const server = http.createServer(app.getServerCb())
app.attachServer(server)
server.listen(3000)
// later: await app.close()
```

### `getServerCb()`

Returns the raw `(req, res) => void` callback for use with any Node.js HTTP server:

```ts
const cb = app.getServerCb()
http.createServer(cb).listen(3000)
// or with https:
https.createServer(sslOpts, cb).listen(443)
```

## Sharing Router Between Adapters

Multiple adapters can share the same Wooks router:

```ts
import { Wooks } from 'wooks'
import { createHttpApp } from '@wooksjs/event-http'

const wooks = new Wooks()
const app1 = createHttpApp({}, wooks)
const app2 = createHttpApp({}, wooks)  // shares the same routes
```

Or share via another adapter instance:

```ts
const app1 = createHttpApp()
const app2 = createHttpApp({}, app1)  // shares app1's router
```

## Logging

Get a scoped logger from the app:

```ts
const app = createHttpApp()
const logger = app.getLogger('[my-app]')
logger.log('App started')
```

Inside a handler, use the event-scoped logger:

```ts
import { useEventLogger } from '@wooksjs/event-core'

app.get('/process', () => {
  const logger = useEventLogger('my-handler')
  logger.log('Processing request')  // tagged with event ID
  return 'ok'
})
```

## Testing

`@wooksjs/event-http` exports a test utility for running composables outside a real server:

```ts
import { prepareTestHttpContext } from '@wooksjs/event-http'

const runInContext = prepareTestHttpContext({
  url: '/users/42',
  method: 'GET',
  headers: { authorization: 'Bearer test-token' },
  params: { id: '42' },
})

runInContext(() => {
  const { get } = useRouteParams()
  console.log(get('id'))  // '42'

  const { isBearer } = useAuthorization()
  console.log(isBearer())  // true
})
```

### `prepareTestHttpContext(options)`

```ts
interface TTestHttpContext {
  url: string
  method?: string              // default: 'GET'
  headers?: Record<string, string>
  params?: Record<string, string | string[]>
  requestLimits?: TRequestLimits  // app-level body limits for testing
  cachedContext?: {
    cookies?: Record<string, string | null>
    authorization?: TAuthCache
    body?: unknown             // pre-parsed body
    rawBody?: string | Buffer | Promise<Buffer>
    raw?: Partial<THttpContextStore>  // raw store sections
  }
}
```

## Best Practices

- **Use `createHttpApp()` factory** — Don't instantiate `WooksHttp` directly unless you need to extend the class.
- **Use `getServerCb()` for custom servers** — This gives you full control over HTTPS, HTTP/2, or any custom server setup.
- **One composable per concern** — Split auth, validation, user-fetching into separate composables. Compose them in handlers.
- **Use `prepareTestHttpContext()` for unit testing composables** — Test composable logic without starting a server.

## Gotchas

- Composables must be called within a request handler (inside the async context). Calling them at module load time throws.
- `listen()` returns a promise — always `await` it or attach error handling.
- The framework auto-detects content type from your return value (string -> text/plain, object -> application/json). Override with `useSetHeaders().setContentType()`.
