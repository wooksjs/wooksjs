# Get Started with Web App

::: info
Learn more about Wooks to understand its philosophy and advantages:

- [What is Wooks?](/wooks/what)
- [Why Wooks?](/wooks/why)
- [Comparison with Express, Fastify, and h3](/webapp/comparison)
:::

Or you can get hands-on with the HTTP flavor of Wooks right now.

## Installation

```bash
npm install @wooksjs/event-http
```

This gives you access to the Wooks core library and the HTTP adapter, which provides a simple, Express-like API for creating HTTP servers while leveraging Wooks’ composable and context-driven patterns.

## Creating Your First "Hello World" App

In this example, we’ll create an HTTP server that responds to `GET /hello/:name` with a personalized greeting.

**Example:**  
```js
import { createHttpApp, useRouteParams } from '@wooksjs/event-http'

const app = createHttpApp()

// Register a route handler using the GET method shortcut:
app.get('hello/:name', () => `Hello ${useRouteParams().get('name')}!`)

// Start the server on port 3000
app.listen(3000, () => {
    // Use the built-in logger to print a startup message
    app.getLogger('[App]').log('Wooks Server is up on port 3000')
})
```

**Test It:**
```bash
curl http://localhost:3000/hello/World
# Hello World!
```

## Using Node’s `http` Server Directly

You can create http(s) server manually and pass the server callback from the Wooks HTTP app.
Use `getServerCb()` to plug Wooks into an `http` server of your own.

**Example:**  
```js
import { createHttpApp, useRouteParams } from '@wooksjs/event-http'
import http from 'http'  // [!code ++]

const app = createHttpApp()

app.get('hello/:name', () => `Hello ${useRouteParams().get('name')}!`)

const server = http.createServer(app.getServerCb()) // [!code ++]
server.listen(3000, () => { // [!code ++]
app.listen(3000, () => {    // [!code --]
    console.log('Wooks Server is up on port 3000')
}) 
```

**Test It:**
```bash
curl http://localhost:3000/hello/Wooks
# Hello Wooks!
```

When you create the server yourself, call `app.attachServer(server)` so that `app.close()` can stop it. `app.getServer()` returns the attached (or `listen()`-created) `http.Server`, and `await app.close()` shuts it down gracefully.

## AI Agent Skills

Wooks provides a unified skill for AI coding agents (Claude Code, Cursor, Windsurf, Codex, etc.) that covers all packages with progressive-disclosure reference docs.

```bash
npx skills add wooksjs/wooksjs
```

Learn more about AI agent skills at [skills.sh](https://skills.sh).

## What Each Page Covers

- [Introduction](/webapp/introduction) — What `@wooksjs/event-http` gives you at a glance.
- [Comparison](/webapp/comparison) — Concrete differences vs Express, Fastify, and h3.
- [Routing](/webapp/routing) — Route registration, parametric routes, wildcards, path builders.
- [Request Composables](/webapp/composables/request) — Headers, query params, cookies, authorization, client IP, body limits.
- [Response Composables](/webapp/composables/response) — Status, headers, cookies, cache control, error responses.
- [Body Parser](/webapp/body) — Parsing JSON, form data, and more with `@wooksjs/http-body`.
- [Proxy Requests](/webapp/proxy) — Reverse proxying with `@wooksjs/http-proxy`.
- [Serve Static](/webapp/static) — Static file serving with `@wooksjs/http-static`.
- [Programmatic Fetch](/webapp/fetch) — Call your routes in-process with `app.fetch()` / `app.request()`; wrap SSR renders in a request context with `withHttpContext()`.
- [Testing](/webapp/testing) — Integration tests via `app.request()` and unit tests via `prepareTestHttpContext()`.
- [Context and Hooks](/webapp/more-hooks) — Build your own composables with `defineWook`.
- [Framework Integrations](/webapp/integrations/) — Run Wooks inside Express, Fastify, or h3.
- [Logging](/webapp/logging) — Event loggers and logger configuration.

Once comfortable with HTTP, consider exploring the CLI or Workflow flavors for broader event-driven architectures.
