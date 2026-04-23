# @wooksjs/event-http — Core & Routing

For request composables, see [http-request.md](http-request.md). For response API, errors, testing, see [http-response.md](http-response.md).

## Contents

- [App Setup](#app-setup) — `createHttpApp`, `TWooksHttpOptions`
- [Route Registration](#route-registration) — HTTP verbs, `on`, `all`, `upgrade`, `ws`
- [Server Lifecycle](#server-lifecycle) — `listen`, `close`, `attachServer`, `getServerCb`
- [Routing](#routing) — pattern syntax pointer
- [Auto-Status Inference](#auto-status-inference) — method × body → status
- [Handler Chains](#handler-chains)
- [Default and Security Headers](#default-and-security-headers) — `securityHeaders()`
- [Patterns](#patterns) — auth guard, resolve context once
- [Rules & Gotchas](#rules--gotchas)

## App Setup

### `createHttpApp(opts?, wooks?): WooksHttp`

Second argument `wooks?: Wooks | WooksAdapterBase` shares routing with another adapter.

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
| `forwardHeaders` | `string[] \| false`                  | Request headers to propagate to outgoing fetch calls; `false` disables |

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
app.all(path, handler)                    // any HTTP method
app.on(method, path, handler)             // generic method
app.upgrade(path, handler)                // UPGRADE method (custom routing of WebSocket upgrade)
app.ws(handler: WooksUpgradeHandler)      // register a WS upgrade handler (fallback when no UPGRADE route matches)
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

## Rules & Gotchas

- Handlers receive no arguments. All data comes from composables. Composables are lazy — call them only when you need the data.
- Return value becomes the body; framework handles serialization and auto-status. Throw `HttpError` for error responses — do not manually set error status/body.
- `listen()` returns a Promise — `await` it.
- `getServerCb()` does not attach the server. Call `attachServer(server)` separately if you want `close()` to work.
- Pass `ctx` explicitly when calling multiple composables — saves ALS lookups.
