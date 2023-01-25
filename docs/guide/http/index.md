# Wooks HTTP

Wooks Http allows to create an http server with fast routing (thanks to [@prostojs/router](https://github.com/prostojs/router))
and with beauty of composable functions.

As a part of `wooks` event processing framework, `@wooksjs/event-http` implements http events and provides composables that let you:
- parse urls search params
- parse cookies
- parse request body (json, url-encoded, form, ...)
- serve files

### The main ideas behind composable functions are:

1. Never mutate request object (`req`). Accumulate a request context in a separate object(s) instead (`wooks store`);
2. Never parse anything (cookies, body) before it is really requested by the request handler;
3. Get rid of complex predefined data objects containing everything (cookies, headers, body, parsed body etc.) and use composable functions (hooks) instead;
4. Get rid of tons of dependencies (middlewares) and implement everything that is needed for web app in a simple way.

### Official Wooks HTTP composables:

- [@wooksjs/http-body](https://github.com/wooksjs/wooksjs/tree/main/packages/http-body) - to parse body
- [@wooksjs/http-static](https://github.com/wooksjs/wooksjs/tree/main/packages/http-static) - to serve static files
- [@wooksjs/http-proxy](https://github.com/wooksjs/wooksjs/tree/main/packages/http-proxy) - to proxy requests

## Install

```bash
npm install wooks @wooksjs/event-http
```

## Quick Start

```js
import { useRouteParams } from 'wooks'
import { createHttpApp } from '@wooksjs/event-http'

const app = createHttpApp()

app.on('GET', 'hello/:name', () => `Hello ${ useRouteParams().get('name') }!`)

// shortcuts for some methods are supported:
// app.get('hello/:name', () => `Hello ${ useRouteParams().get('name') }!`)

app.listen(3000, () => { console.log('Wooks Server is up on port 3000') })
```
