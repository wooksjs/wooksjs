# Fastify Integration

Use Wooks composables with [Fastify](https://fastify.dev). This adapter lets you register Wooks-style route handlers on top of an existing Fastify app — unmatched requests automatically fall through to Fastify's not-found handler.

::: info
Source code and issues: [github.com/wooksjs/fastify-adapter](https://github.com/wooksjs/fastify-adapter)
:::

[[toc]]

## Install

```bash
npm install @wooksjs/fastify-adapter @wooksjs/event-http wooks fastify
```

## Quick Start

```ts
import Fastify from 'fastify'
import { WooksFastify } from '@wooksjs/fastify-adapter'
import { useRouteParams, useRequest, HttpError } from '@wooksjs/event-http'

const app = Fastify()
const wooks = new WooksFastify(app)

// Return values become the response body
wooks.get('/hello/:name', () => {
    const { get } = useRouteParams()
    return { hello: get('name') }
})

// Async handlers work out of the box
wooks.post('/upload', async () => {
    const { rawBody } = useRequest()
    const body = await rawBody()
    return { received: body.length }
})

// Throw HttpError for error responses
wooks.get('/protected', () => {
    throw new HttpError(403, 'Forbidden')
})

app.listen({ port: 3000 }, () => console.log('listening on 3000'))
```

## How It Works

`WooksFastify` extends `WooksHttp` and registers a catch-all route in Fastify. When a request comes in:

1. Wooks checks if a matching route is registered
2. If matched — the Wooks handler runs with full composable support
3. If not matched — the request falls through to Fastify's not-found handler

This means you can use Wooks composables for your route handlers while still leveraging Fastify's plugin ecosystem:

```ts
import Fastify from 'fastify'
import { WooksFastify } from '@wooksjs/fastify-adapter'

const app = Fastify()

// Wooks handles these routes
const wooks = new WooksFastify(app)
wooks.get('/api/users', () => {
    return [{ id: 1, name: 'Alice' }]
})

app.listen({ port: 3000 })
```

## API

### `new WooksFastify(fastifyApp, options?)`

Creates a new adapter instance and registers a catch-all route on the Fastify app.

| Option           | Type                       | Default | Description                                                                       |
| ---------------- | -------------------------- | ------- | --------------------------------------------------------------------------------- |
| `raise404`       | `boolean`                  | `false` | Return 404 from Wooks for unmatched routes instead of using Fastify's not-found   |
| `onNotFound`     | `() => unknown`            | —       | Custom handler for unmatched routes                                               |
| `logger`         | `TConsoleBase`             | —       | Custom logger instance                                                            |
| `router`         | `object`                   | —       | Router options (`ignoreTrailingSlash`, `ignoreCase`, `cacheLimit`)                |
| `requestLimits`  | `object`                   | —       | Default request body size limits                                                  |
| `defaultHeaders` | `Record<string, string>`   | —       | Headers added to every response                                                   |
| `responseClass`  | `typeof WooksHttpResponse` | —       | Custom response class                                                             |

### Route Methods

```ts
wooks.get(path, handler)
wooks.post(path, handler)
wooks.put(path, handler)
wooks.patch(path, handler)
wooks.delete(path, handler)
wooks.head(path, handler)
wooks.options(path, handler)
wooks.all(path, handler)
```

Handlers take **no arguments** — use [composables](/webapp/composables/) to access request data:

```ts
wooks.get('/users/:id', () => {
    const { get } = useRouteParams()
    const { method, url, rawBody, getIp } = useRequest()
    const headers = useHeaders()
    const response = useResponse()

    response.setHeader('x-custom', 'value')
    return { id: get('id') }
})
```

### `wooks.listen(...args)`

Starts the Fastify server and returns a promise that resolves when listening.

```ts
await wooks.listen({ port: 3000 })
```

### `wooks.close()`

Stops the server.

```ts
await wooks.close()
```

## Available Composables

These come from `@wooksjs/event-http` and work inside any Wooks handler:

| Composable           | Purpose                                     |
| -------------------- | ------------------------------------------- |
| `useRequest()`       | Request method, URL, headers, body, IP      |
| `useRouteParams()`   | Route parameters (`:id`, etc.)              |
| `useHeaders()`       | Request headers                             |
| `useResponse()`      | Set status, headers, cookies, cache control |
| `useCookies()`       | Read request cookies                        |
| `useUrlParams()`     | URL query parameters                        |
| `useAuthorization()` | Parse Authorization header                  |
| `useAccept()`        | Check Accept header                         |
| `useLogger()`        | Event-scoped logger                         |

See the [Composables](/webapp/composables/) section for full reference.
