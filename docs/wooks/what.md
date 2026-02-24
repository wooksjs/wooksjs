# What is Wooks?

Wooks is a TypeScript-first event framework for Node.js. It handles HTTP requests, CLI commands, workflows, and custom event types through a single composable-based architecture.

## Composables

A composable is a function that accesses per-event contextual data. You call it — you get typed data back. No arguments, no `req` object, no middleware registration.

```ts
app.post('/submit', async () => {
  const { parseBody } = useBody()
  const body = await parseBody<{ name: string }>()

  const response = useResponse()
  response.setStatus(201)

  return { created: body.name }
})
```

`useBody()` doesn't parse anything until you call `parseBody()`. `useResponse()` doesn't allocate anything until you call a method on it. Composables are lazy — they do work only when asked.

Under the hood, each composable reads from an `EventContext` — a per-event `Map` of typed slots, propagated via `AsyncLocalStorage`. You never see it, but it's why composables work anywhere in the call stack, through any number of `await` boundaries.

## `defineWook`

Every built-in composable is created with `defineWook` — and so are yours:

```ts
import { defineWook } from '@wooksjs/event-core'
import { useAuthorization } from '@wooksjs/event-http'

export const useCurrentUser = defineWook((ctx) => {
  const { basicCredentials } = useAuthorization(ctx)
  const username = basicCredentials()?.username
  return {
    username,
    profile: async () => username ? await db.findUser(username) : null,
  }
})
```

The factory runs once per event. Every subsequent call to `useCurrentUser()` within the same request returns the cached result. This is the same mechanism that powers `useBody`, `useResponse`, `useCookies`, and every other composable in the framework.

## Context Primitives

The context system is built on a small set of primitives:

| Primitive | What it does |
|-----------|-------------|
| `key<T>(name)` | A writable typed slot — you `set` and `get` values explicitly |
| `cached<T>(fn)` | A read-only slot — computed lazily on first access, cached for the event lifetime |
| `cachedBy<K, V>(fn)` | Like `cached`, but keyed — one result per unique argument |
| `defineEventKind(name, slots)` | Declares a named event schema with typed seed slots |
| `defineWook(factory)` | Creates a composable with per-event caching |

There are no string-keyed stores, no `Object.defineProperty` hooks. The context is a flat `Map<number, unknown>` with compile-time type safety layered on top.

## Events, Not Just HTTP

Every interaction in Wooks follows the same lifecycle:

1. Create an `EventContext`
2. Seed it with event-specific data (HTTP request, CLI args, workflow state)
3. Look up and run handlers
4. Composables pull data from context on demand

HTTP is one implementation. CLI is another. You can define your own event kinds with `defineEventKind` and build adapters that follow the same pattern. The composables you write for one event type work in any other — as long as they only depend on shared context.

## Package Structure

| Package | Role |
|---------|------|
| [@prostojs/router](https://github.com/prostojs/router) | Standalone high-performance router |
| @wooksjs/event-core | Context primitives: `key`, `cached`, `defineWook`, `defineEventKind` |
| @wooksjs/event-http | HTTP adapter, request/response composables |
| @wooksjs/event-cli | CLI adapter, option/argument composables |
| @wooksjs/event-wf | Workflow adapter, step/flow composables |
| @wooksjs/http-body | Body parser composable |
| @wooksjs/http-static | Static file serving |
| @wooksjs/http-proxy | Reverse proxy composable |
