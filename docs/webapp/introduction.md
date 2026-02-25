# Introduction to Wooks HTTP

`@wooksjs/event-http` is the HTTP adapter for Wooks. It gives you a Node.js HTTP server where every handler is a plain function that returns its response, and every piece of request data is available through composables — on demand, typed, cached.

## Quick Picture

```ts
import { createHttpApp } from '@wooksjs/event-http'
import { useBody } from '@wooksjs/http-body'

const app = createHttpApp()

app.post('/users', async () => {
  const { parseBody } = useBody()
  const user = await parseBody<{ name: string }>()
  return { created: user.name } // → 201, application/json
})

app.listen(3000)
```

No middleware to register. No `req`/`res` parameters. The body is parsed only when `parseBody()` is called. The response status and content type are inferred from the return value and HTTP method.

## What You Get

| Composable | What it provides |
|------------|-----------------|
| `useRequest()` | Method, URL, headers, raw body, IP, request limits |
| `useResponse()` | Status, headers, cookies, cache control — one chainable API |
| `useBody()` | JSON, URL-encoded, multipart, text parsing — on demand |
| `useRouteParams()` | Typed route parameters |
| `useCookies()` | Incoming cookie values |
| `useUrlParams()` | URL query parameters |
| `useAuthorization()` | Authorization header parsing (Basic, Bearer) |

Plus `@wooksjs/http-static` for file serving and `@wooksjs/http-proxy` for reverse proxy.

## Routing

Built on [`@prostojs/router`](https://github.com/prostojs/router) — parametric routes, wildcards, regex constraints, and multiple wildcards in a single path. See [Routing](/webapp/routing) for details.

## Build Your Own Composables

`defineWook` is the same primitive that powers every built-in composable. Your custom logic works exactly the same way — cached per request, typed, composable with everything else. See [Custom Composables](/webapp/more-hooks) for examples.

## Next Steps

- [Quick Start](/webapp/) — Spin up a server in minutes.
- [What is Wooks?](/wooks/what) — How composables, context, and `defineWook` work under the hood.
- [Why Wooks?](/wooks/why) — The design decisions and when Wooks is the right choice.
- [Comparison](/webapp/comparison) — Concrete differences vs Express, Fastify, and h3.
