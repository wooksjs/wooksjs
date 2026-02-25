# Core setup & routing — @wooksjs/event-http

> Creating an app, registering routes, server lifecycle, and architecture overview.

## Concepts

`@wooksjs/event-http` wraps a Node.js HTTP server with Wooks' composable architecture. Each incoming request gets its own `EventContext` (from `@wooksjs/event-core`), and handlers are plain functions that return their response. All request data is accessed through composables — on demand, typed, cached.

The adapter creates context, seeds it with the `IncomingMessage` and `HttpResponse`, looks up routes, and runs handlers. Handlers never receive `req`/`res` parameters.

## Installation

```bash
pnpm add @wooksjs/event-http
```

Peer dependencies: `@wooksjs/event-core`, `wooks`, `@prostojs/router`, `@prostojs/logger`.

## API Reference

### `createHttpApp(opts?): WooksHttp`

Creates and returns a `WooksHttp` instance.

```ts
import { createHttpApp } from '@wooksjs/event-http'

const app = createHttpApp()
app.get('/hello', () => 'Hello World!')
app.listen(3000)
```

**Options (`TWooksHttpOptions`):**

| Option           | Type                                 | Description                                                               |
| ---------------- | ------------------------------------ | ------------------------------------------------------------------------- |
| `logger`         | `TConsoleBase`                       | Custom logger instance                                                    |
| `onNotFound`     | `TWooksHandler`                      | Handler called when no route matches (default: 404 HttpError)             |
| `router`         | router options                       | Custom router configuration                                               |
| `requestLimits`  | `Omit<TRequestLimits, 'perRequest'>` | Default body size/timeout limits for all requests                         |
| `responseClass`  | `typeof WooksHttpResponse`           | Custom response subclass (default: `WooksHttpResponse`)                   |
| `defaultHeaders` | `Record<string, string \| string[]>` | Default headers applied to every response (e.g. from `securityHeaders()`) |

### Route registration

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

Handlers are plain functions. Return value becomes the response body:

```ts
app.get('/users/:id', () => {
  const { params } = useRouteParams<{ id: string }>()
  return { id: params.id } // → 200 application/json
})

app.post('/users', async () => {
  const { parseBody } = useBody() // from @wooksjs/http-body
  const user = await parseBody<{ name: string }>()
  return { created: user.name } // → 201 application/json (POST auto-status)
})
```

### Server lifecycle

```ts
// Start server
await app.listen(3000)
await app.listen(3000, '0.0.0.0')

// Use with existing server
import http from 'http'
const server = http.createServer(app.getServerCb())
server.listen(3000)
app.attachServer(server)

// Stop server
await app.close()
```

### `getServerCb()`

Returns a `(req, res) => void` callback for use with any Node.js HTTP server:

```ts
const cb = app.getServerCb()
http.createServer(cb).listen(3000)
// or with https, http2, etc.
```

## Routing

Built on [`@prostojs/router`](https://github.com/prostojs/router). Supports:

- Static routes: `/api/users`
- Parametric routes: `/users/:id`
- Wildcards: `/static/*`
- Multiple wildcards: `/static/*/assets/*`
- Regex constraints: `/api/time/:hours(\\d{2})h:minutes(\\d{2})m`
- Regex wildcards: `/static/*(\\d+)`

Route params accessed via `useRouteParams()`:

```ts
app.get('/users/:id', () => {
  const { params } = useRouteParams<{ id: string }>()
  return { userId: params.id }
})
```

## Auto-status

When no explicit status is set, it's inferred from the HTTP method and response body:

| Method | With body    | Without body   |
| ------ | ------------ | -------------- |
| GET    | 200 OK       | 204 No Content |
| POST   | 201 Created  | 204 No Content |
| PUT    | 201 Created  | 204 No Content |
| PATCH  | 202 Accepted | 204 No Content |
| DELETE | 202 Accepted | 204 No Content |

## Handler chain

Multiple handlers can be registered for the same route. If one throws, the next is tried:

```ts
app.get('/resource', authHandler, mainHandler)
```

If all handlers throw, the last error is sent as the response.

## Best Practices

- Return values directly — the framework handles serialization and status codes
- Use `HttpError` for error responses: `throw new HttpError(404)` or `throw new HttpError(400, 'Invalid input')`
- Use `useResponse()` only when you need explicit control over headers, cookies, or status
- For `getServerCb()`, call `attachServer(server)` if you want `close()` to work

## Gotchas

- Handlers receive no arguments — all data comes from composables
- `listen()` returns a Promise — `await` it or handle rejection
- `getServerCb()` doesn't automatically attach the server — call `attachServer()` if needed
