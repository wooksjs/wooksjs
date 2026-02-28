# Express Integration

Use Wooks composables with [Express](https://expressjs.com). This adapter lets you register Wooks-style route handlers on top of an existing Express app — unmatched requests automatically fall through to Express middleware.

::: info
Source code and issues: [github.com/wooksjs/express-adapter](https://github.com/wooksjs/express-adapter)
:::

[[toc]]

## Install

```bash
npm install @wooksjs/express-adapter @wooksjs/event-http wooks express
```

## Quick Start

```ts
import express from 'express'
import { WooksExpress } from '@wooksjs/express-adapter'
import { useRouteParams, useRequest, HttpError } from '@wooksjs/event-http'

const app = express()
const wooks = new WooksExpress(app)

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

app.listen(3000, () => console.log('listening on 3000'))
```

## How It Works

`WooksExpress` extends `WooksHttp` and registers itself as Express middleware. When a request comes in:

1. Wooks checks if a matching route is registered
2. If matched — the Wooks handler runs with full composable support
3. If not matched — the request falls through to the next Express middleware

This means you can **mix Wooks routes with regular Express routes and middleware**:

```ts
import express from 'express'
import { WooksExpress } from '@wooksjs/express-adapter'
import cors from 'cors'

const app = express()

// Express middleware works as usual
app.use(cors())
app.use(express.json())

// Wooks handles these routes
const wooks = new WooksExpress(app)
wooks.get('/api/users', () => {
    return [{ id: 1, name: 'Alice' }]
})

// Express handles this route
app.get('/legacy', (req, res) => {
    res.send('handled by express')
})

app.listen(3000)
```

## API

### `new WooksExpress(expressApp, options?)`

Creates a new adapter instance and registers Wooks middleware on the Express app.

| Option           | Type                       | Default | Description                                                                      |
| ---------------- | -------------------------- | ------- | -------------------------------------------------------------------------------- |
| `raise404`       | `boolean`                  | `false` | Return 404 from Wooks for unmatched routes instead of falling through to Express |
| `onNotFound`     | `() => unknown`            | —       | Custom handler for unmatched routes                                              |
| `logger`         | `TConsoleBase`             | —       | Custom logger instance                                                           |
| `router`         | `object`                   | —       | Router options (`ignoreTrailingSlash`, `ignoreCase`, `cacheLimit`)               |
| `requestLimits`  | `object`                   | —       | Default request body size limits                                                 |
| `defaultHeaders` | `Record<string, string>`   | —       | Headers added to every response                                                  |
| `responseClass`  | `typeof WooksHttpResponse` | —       | Custom response class                                                            |

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

### `wooks.listen(port)`

Starts the Express server and returns a promise that resolves when listening.

```ts
await wooks.listen(3000)
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
