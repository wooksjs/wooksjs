---
name: wooksjs-event-http
description: Use this skill when working with @wooksjs/event-http — to create HTTP servers with createHttpApp(), register route handlers with app.get()/post()/put()/patch()/delete(), read request data with useRequest()/useHeaders()/useCookies()/useSearchParams()/useAuthorization()/useAccept(), control responses with useResponse() and HttpResponse (status, headers, cookies, cache control, streaming), throw HTTP errors with HttpError, test handlers with prepareTestHttpContext(), or integrate with existing Node.js servers via getServerCb().
---

# @wooksjs/event-http

HTTP adapter for Wooks. Composable-based request handling where every piece of data is available on demand, typed, and cached per request. No middleware, no `req`/`res` parameters — just function calls.

## How to use this skill

Read the domain file that matches the task. Do not load all files — only what you need.

| Domain | File | Load when... |
|--------|------|------------|
| Core setup & routing | [core.md](core.md) | Creating an app, registering routes, starting a server, understanding the architecture |
| Request composables | [request.md](request.md) | Reading request data: headers, cookies, query params, body, authorization, IP |
| Response API | [response.md](response.md) | Setting status, headers, cookies, cache control, sending responses, error handling |
| Testing | [testing.md](testing.md) | Writing tests for handlers and composables with `prepareTestHttpContext` |

## Quick reference

```ts
import { createHttpApp } from '@wooksjs/event-http'

// Composables (no arguments — context via AsyncLocalStorage)
import {
  useRequest, useResponse, useHeaders, useCookies,
  useSearchParams, useAuthorization, useAccept,
  useRouteParams, useLogger,
} from '@wooksjs/event-http'

// Errors
import { HttpError } from '@wooksjs/event-http'

// Testing
import { prepareTestHttpContext } from '@wooksjs/event-http'
```
