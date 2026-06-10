---
name: wooksjs
description: >-
  Use when working with the wooksjs monorepo or any @wooksjs package. Covers
  @wooksjs/event-core (EventContext, key/cached/cachedBy slots, defineWook,
  defineEventKind, AsyncLocalStorage, useRouteParams, useEventId, useLogger),
  @wooksjs/event-http (createHttpApp, HTTP routing, useRequest, useHeaders,
  useCookies, useUrlParams, useAuthorization, useAccept, useResponse,
  HttpError, prepareTestHttpContext), @wooksjs/http-body (useBody, parseBody,
  body parsing), @wooksjs/http-static (serveFile, static files),
  @wooksjs/http-proxy (useProxy), @wooksjs/event-cli (createCliApp, command
  routing, useCliOptions, useCliOption, useCliHelp, useAutoHelp),
  @wooksjs/event-ws (WooksWs, onMessage, onConnect, onDisconnect,
  useWsConnection, useWsMessage, useWsRooms, useWsServer, WsError),
  @wooksjs/event-wf (createWfApp, steps/flows, useWfState, pause/resume,
  StepRetriableError, outlets, swapStrategy), @wooksjs/ws-client
  (createWsClient, reconnection, RPC, push listeners, WsClientError). Not for
  moostjs or generic Node http servers.
---

# wooksjs

Typed composable framework for Node.js. Every piece of request/event data is accessed through composable functions — no `req`/`res` parameters, no middleware chains. Adapters: HTTP, CLI, WebSocket, Workflows. Plus a standalone WebSocket client.

## Install

| Package                | Install                            | Peer notes                                                                   |
| ---------------------- | ---------------------------------- | ---------------------------------------------------------------------------- |
| `@wooksjs/event-http`  | `npm i wooks @wooksjs/event-http`  | —                                                                            |
| `@wooksjs/event-cli`   | `npm i wooks @wooksjs/event-cli`   | —                                                                            |
| `@wooksjs/event-ws`    | `npm i wooks @wooksjs/event-ws ws` | `ws ^8.0.0` required                                                         |
| `@wooksjs/event-wf`    | `npm i wooks @wooksjs/event-wf`    | optional peers `@wooksjs/event-http` + `@wooksjs/http-body` (HTTP outlets)   |
| `@wooksjs/http-body`   | `npm i @wooksjs/http-body`         | peers `@wooksjs/event-core`, `@wooksjs/event-http`                           |
| `@wooksjs/http-static` | `npm i @wooksjs/http-static`       | peer `@wooksjs/event-http`                                                   |
| `@wooksjs/http-proxy`  | `npm i @wooksjs/http-proxy`        | peer `@wooksjs/event-http`                                                   |
| `@wooksjs/ws-client`   | `npm i @wooksjs/ws-client`         | `ws` optional — Node only; browsers use native WebSocket                     |

### Dependency map

```
event-core  <-  wooks  <-  adapters: event-http, event-cli, event-ws, event-wf
                           event-http  <-  utilities: http-body, http-static, http-proxy

ws-client: standalone (no event-core dependency)
```

- Utilities peer-depend on `event-http` specifically (`http-body` also on `event-core`).
- `event-wf` has optional peers `@wooksjs/event-http` + `@wooksjs/http-body` — install both when using HTTP outlets.

## Architecture

All public API is composables created with `defineWook`, cached per `EventContext` — a typed slot container (`key`/`cached`/`cachedBy`/`slot`) propagated via `AsyncLocalStorage`; call `current()` to get it anywhere without parameter passing. Parent context chains let nested events (HTTP → workflow, HTTP → WS upgrade) read parent slots. Details: [event-core.md](references/event-core.md).

## Quick start

```ts
import { createHttpApp, useRouteParams } from '@wooksjs/event-http'

const app = createHttpApp()
app.get('/hello/:name', () => `Hello, ${useRouteParams().get('name')}!`)
app.listen(3000)
```

Most reference files end with a Rules & Gotchas table — read it before writing code.

## Key imports

```ts
// event-core — context engine, custom adapters
import { key, cached, cachedBy, slot, defineEventKind, defineWook,
  EventContext, run, current, tryGetCurrent, createEventContext,
  useRouteParams, useEventId, useLogger, routeParamsKey, eventTypeKey,
  ContextInjector, getContextInjector, replaceContextInjector, resetContextInjector } from '@wooksjs/event-core'

// event-http — HTTP server + request/response composables
import { createHttpApp, useRequest, useResponse, useHeaders, useCookies,
  useUrlParams, useAuthorization, useAccept,
  HttpError, prepareTestHttpContext } from '@wooksjs/event-http'

// http-body — parsed request bodies (JSON, form-data, urlencoded)
import { useBody } from '@wooksjs/http-body'

// http-static — file serving
import { serveFile } from '@wooksjs/http-static'

// http-proxy — reverse proxy
import { useProxy } from '@wooksjs/http-proxy'

// event-cli — command-line apps
import { createCliApp, useCliOptions, useCliOption,
  useCliHelp, useAutoHelp, useCommandLookupHelp } from '@wooksjs/event-cli'

// event-ws — WebSocket server
import { createWsApp, useWsConnection, useWsMessage, useWsRooms, useWsServer,
  currentConnection, prepareTestWsConnectionContext, prepareTestWsMessageContext } from '@wooksjs/event-ws'

// event-wf — workflows
import { createWfApp, useWfState, StepRetriableError } from '@wooksjs/event-wf'

// ws-client — standalone WS client (browser + Node)
import { createWsClient } from '@wooksjs/ws-client'
```

## References

Read the reference file that matches the task. Do not load all files — only what is needed.

| Domain            | File                                              | Load when...                                                        |
| ----------------- | ------------------------------------------------- | -------------------------------------------------------------------- |
| Routing           | [router.md](references/router.md)                 | Route patterns, params, wildcards, regex, path builders, config      |
| Context engine    | [event-core.md](references/event-core.md)         | Working with slots, composables, EventContext, custom adapters       |
| HTTP core/routing | [event-http.md](references/event-http.md)         | Creating HTTP apps, routing, server lifecycle, security headers      |
| HTTP request      | [http-request.md](references/http-request.md)     | Reading headers, cookies, query params, raw body, authorization      |
| HTTP response     | [http-response.md](references/http-response.md)   | Status, headers, cookies, cache, errors, streaming, testing          |
| Body parsing      | [http-body.md](references/http-body.md)           | Parsing request bodies (useBody): JSON, form-data, urlencoded types  |
| Static files      | [http-static.md](references/http-static.md)       | Serving files/directories (serveFile), ranges, cache headers         |
| HTTP proxy        | [http-proxy.md](references/http-proxy.md)         | Proxying/forwarding requests, header/cookie filtering, allowedHosts  |
| CLI apps          | [event-cli.md](references/event-cli.md)           | Building CLI tools, command routing, options, help system            |
| WebSocket server  | [event-ws.md](references/event-ws.md)             | WS server, rooms, broadcasting, message routing, wire protocol       |
| Workflow core     | [event-wf.md](references/event-wf.md)             | Steps, flows, schema syntax, pause/resume, useWfState                |
| Workflow outlets  | [wf-outlets.md](references/wf-outlets.md)         | HTTP/email delivery, state strategies, tokens, trigger handler       |
| Workflow advanced | [wf-advanced.md](references/wf-advanced.md)       | Parent context, spies, error handling, testing                       |
| WS client         | [ws-client.md](references/ws-client.md)           | Browser/Node WS client, RPC, subscriptions, reconnection             |

## Cross-cutting pointers

- Parent context chains (HTTP → workflow, HTTP → WS): [wf-advanced.md](references/wf-advanced.md#parent-context-sharing)
- Shared router across adapters (`createCliApp({}, http)` etc.): [router.md](references/router.md#shared-router)
- Performance — resolve context once per handler: [event-http.md](references/event-http.md#performance-resolve-context-once)
- Auto-status inference (method × body → status): [event-http.md](references/event-http.md#auto-status-inference)
- WS wire protocol (3 message shapes): [event-ws.md](references/event-ws.md#wire-protocol)
- Express/Fastify/H3 integrations are separate packages — `@wooksjs/express-adapter`, `@wooksjs/fastify-adapter`, `@wooksjs/h3-adapter`; docs: https://wooks.moost.org/webapp/integrations/

## See also

- Docs site: https://wooks.moost.org
- Source: https://github.com/wooksjs/wooksjs
