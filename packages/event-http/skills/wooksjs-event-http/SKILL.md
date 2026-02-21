---
name: wooksjs-event-http
description: Wooks HTTP framework — composable, lazy-evaluated HTTP server for Node.js. Load when building HTTP apps or REST APIs with wooks; defining routes or using the wooks router; using use-composables (useRequest, useResponse, useCookies, useHeaders, useBody, useProxy, useSearchParams, useRouteParams, useAuthorization, useSetHeaders, useSetCookies, useStatus, useAccept, useSetCacheControl); creating custom event context composables; working with @wooksjs/event-core context store (init, get, set, hook); serving static files; proxying requests; handling HTTP errors; setting status codes, content types, or cache control.
---

# @wooksjs/event-http

A composable HTTP framework for Node.js built on async context (AsyncLocalStorage). Instead of middleware chains and mutated `req`/`res` objects, you call composable functions (`useRequest()`, `useCookies()`, etc.) anywhere in your handler — values are computed on demand and cached per request.

## How to use this skill

Read the domain file that matches the task. Do not load all files — only what you need.

| Domain | File | Load when... |
|--------|------|------------|
| Event context (core machinery) | [event-core.md](event-core.md) | Understanding the context store API (`init`/`get`/`set`/`hook`), creating custom composables, lazy evaluation and caching, building your own `use*()` functions |
| HTTP app setup | [core.md](core.md) | Creating an HTTP app, server lifecycle, `createHttpApp`, `getServerCb`, testing with `prepareTestHttpContext`, logging |
| Routing | [routing.md](routing.md) | Defining routes, route params (`:id`), wildcards (`*`), regex constraints (`:id(\\d+)`), optional params (`:tab?`), repeated params, path builders, HTTP method shortcuts, handler return values, router config |
| Request utilities | [request.md](request.md) | `useRequest`, `useHeaders`, `useCookies`, `useSearchParams`, `useAuthorization`, `useAccept`, `useEventId`, reading IP, body limits |
| Response & status | [response.md](response.md) | `useResponse`, `useStatus`, `useSetHeaders`, `useSetHeader`, `useSetCookies`, `useSetCookie`, `useSetCacheControl`, content type, status hooks, cookie hooks |
| Error handling | [error-handling.md](error-handling.md) | `HttpError`, throwing errors, custom error bodies, error rendering, guard patterns |
| Addons (body, static, proxy) | [addons.md](addons.md) | `useBody` (body parsing), `serveFile` (static files), `useProxy` (request proxying) |

## Quick reference

```ts
import { createHttpApp, useRouteParams } from '@wooksjs/event-http'

const app = createHttpApp()
app.get('/hello/:name', () => {
  const { get } = useRouteParams<{ name: string }>()
  return { greeting: `Hello ${get('name')}!` }
})
app.listen(3000)
```

Key composables: `useRequest()`, `useResponse()`, `useRouteParams()`, `useHeaders()`, `useSetHeaders()`, `useCookies()`, `useSetCookies()`, `useSearchParams()`, `useAuthorization()`, `useAccept()`, `useSetCacheControl()`, `useStatus()`, `useBody()`, `useProxy()`.
