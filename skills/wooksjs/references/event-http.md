# @wooksjs/event-http — Core & Routing

## Table of Contents

1. [App Setup](#app-setup)
2. [Route Registration](#route-registration)
3. [Server Lifecycle](#server-lifecycle)
4. [Routing Patterns](#routing-patterns)
5. [Auto-Status Inference](#auto-status-inference)
6. [Handler Chains](#handler-chains)
7. [Default and Security Headers](#default-and-security-headers)
8. [Patterns](#patterns)
9. [Best Practices](#best-practices)
10. [Gotchas](#gotchas)

For request composables, see [http-request.md](http-request.md).
For response API, errors, and testing, see [http-response.md](http-response.md).

---

## App Setup

### `createHttpApp(opts?): WooksHttp`

```ts
import { createHttpApp } from '@wooksjs/event-http'

const app = createHttpApp()
app.get('/hello', () => 'Hello World!')
app.listen(3000)
```

**Options (`TWooksHttpOptions`):**

| Option           | Type                                 | Description                                                      |
| ---------------- | ------------------------------------ | ---------------------------------------------------------------- |
| `logger`         | `TConsoleBase`                       | Custom logger instance                                           |
| `onNotFound`     | `TWooksHandler`                      | Handler when no route matches (default: 404 HttpError)           |
| `router`         | router options                       | Custom router configuration                                      |
| `requestLimits`  | `Omit<TRequestLimits, 'perRequest'>` | Default body size/timeout limits for all requests                |
| `responseClass`  | `typeof WooksHttpResponse`           | Custom response subclass (default: `WooksHttpResponse`)          |
| `defaultHeaders` | `Record<string, string \| string[]>` | Default headers applied to every response (e.g. securityHeaders) |

---

## Route Registration

```ts
app.get(path, handler)
app.post(path, handler)
app.put(path, handler)
app.patch(path, handler)
app.delete(path, handler)
app.head(path, handler)
app.options(path, handler)
app.all(path, handler) // matches any HTTP method
```

Handlers are plain functions. Return value becomes the response body.

`useRouteParams` and `useLogger` are re-exported from `@wooksjs/event-core`. See [event-core.md](event-core.md) for details.

---

## Server Lifecycle

```ts
// Start
await app.listen(3000)
await app.listen(3000, '0.0.0.0')

// Use with existing server
import http from 'http'
const server = http.createServer(app.getServerCb())
server.listen(3000)
app.attachServer(server) // required if you want app.close() to work

// Stop
await app.close()
```

`getServerCb()` returns a `(req, res) => void` callback usable with any Node.js HTTP/HTTPS/HTTP2 server.

---

## Routing

Built on `@prostojs/router`. See [router.md](router.md) for full pattern syntax (parametric,
wildcards, regex constraints, optional params, path builders, config options).

---

## Auto-Status Inference

When no explicit status is set, inferred from HTTP method and response body:

| Method | With body    | Without body   |
| ------ | ------------ | -------------- |
| GET    | 200 OK       | 204 No Content |
| POST   | 201 Created  | 204 No Content |
| PUT    | 201 Created  | 204 No Content |
| PATCH  | 202 Accepted | 204 No Content |
| DELETE | 202 Accepted | 204 No Content |

---

## Handler Chains

Multiple handlers per route. If one throws, the next is tried:

```ts
app.get('/resource', authHandler, mainHandler)
```

If all handlers throw, the last error is sent as the response.

---

## Default and Security Headers

Apply default headers to every response:

```ts
import { createHttpApp, securityHeaders } from '@wooksjs/event-http'
const app = createHttpApp({ defaultHeaders: securityHeaders() })
```

`securityHeaders(opts?)` default values:

| Header                         | Default                                                                           |
| ------------------------------ | --------------------------------------------------------------------------------- |
| `content-security-policy`      | `default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'` |
| `cross-origin-opener-policy`   | `same-origin`                                                                     |
| `cross-origin-resource-policy` | `same-origin`                                                                     |
| `referrer-policy`              | `no-referrer`                                                                     |
| `x-content-type-options`       | `nosniff`                                                                         |
| `x-frame-options`              | `SAMEORIGIN`                                                                      |

Each option accepts `string` (override) or `false` (disable). `strictTransportSecurity` is opt-in only.

```ts
securityHeaders({
  contentSecurityPolicy: false,
  referrerPolicy: 'strict-origin-when-cross-origin',
  strictTransportSecurity: 'max-age=31536000; includeSubDomains',
})
```

Per-endpoint override: `response.setHeaders(securityHeaders({ ... }))`.

---

## Patterns

### Auth Guard Composable

```ts
app.post('/admin/action', async () => {
  const { is, credentials } = useAuthorization()
  if (!is('bearer')) throw new HttpError(401)

  const token = credentials()!
  const user = await verifyToken(token)
  if (!user.isAdmin) throw new HttpError(403)

  // Body is never parsed if auth fails (lazy evaluation)
  const { parseBody } = useBody() // from @wooksjs/http-body
  return parseBody()
})
```

### Performance: Resolve Context Once

When calling multiple composables in a hot path, resolve the context once:

```ts
import { current } from '@wooksjs/event-core'

app.get('/hot-path', () => {
  const ctx = current()
  const { method } = useRequest(ctx)
  const { getCookie } = useCookies(ctx)
  const { params } = useUrlParams(ctx)
  // 1 ALS lookup instead of 3
})
```

---

## Best Practices

- Return values directly; the framework handles serialization and status codes.
- Use `HttpError` for all error responses; do not manually set error status and body.
- Composables are lazy; call them only when you need the data.
- Pass `ctx` explicitly in hot paths with multiple composable calls to reduce ALS lookups.
- For `getServerCb()`, call `attachServer(server)` if you want `close()` to work.

---

## Gotchas

- Handlers receive no arguments. All data comes from composables.
- `listen()` returns a Promise. Always `await` it or handle rejection.
- `getServerCb()` does not automatically attach the server. Call `attachServer()` separately.
