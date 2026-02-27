# What is Wooks?

Wooks is a TypeScript-first event-processing framework for Node.js built around one idea: **event context should be a first-class citizen**.

The name comes from **w**(eb) (h)**ooks** — but the concept goes far beyond HTTP. Wooks handles HTTP requests, CLI commands, WebSocket messages, workflows, and custom event types through a single architecture.

## The Problem

When you handle an HTTP request, you need context — route params, body, cookies, auth, user info, IP address. As your app grows, so does the pile of context you need per event.

Traditional frameworks don't have a great answer for this:

- **Express / Fastify**: everything goes on `req`. No type safety, no structure. Every middleware mutates a shared object — `req.user`, `req.body`, `req.parsedQuery` — and you cross your fingers it's all there by the time your handler runs.
- **h3**: a cleaner `event` object — better. But extending it type-safely? Building lazy, cached properties on it? No built-in tools for that. You're back to ad-hoc code.

Wooks was built to solve this.

## The Solution: Typed Event Context

Wooks gives every event — HTTP request, CLI command, workflow step — a **typed context** with built-in support for lazy computation and automatic caching.

The API feels natural: call `useRequest()`, `useBody()`, or `useAuthorization()` from anywhere in your code. No passing `req` around, no `event` threading. These composable functions read from the current event's context automatically, thanks to `AsyncLocalStorage`.

## What is a Wook?

A **wook** is a composable function for the backend — inspired by Vue's Composition API. Call it inside any event handler and get back typed, per-event data. No arguments needed, no event object to pass around.

```ts
const { params, get } = useRouteParams<{ id: string }>()
const logger = useLogger()
logger.info('Processing event for', get('id'))
```

Wooks are lazy — nothing is parsed or computed until you actually call one.

Under the hood, each wook reads from an `EventContext` propagated via `AsyncLocalStorage`. You never see it directly, but it's why wooks work anywhere in the call stack, through any number of `await` boundaries — just like Vue composables work anywhere inside `setup()`.

## `defineWook`

Every built-in wook is created with `defineWook` — and yours can be too:

```ts
import { defineWook, key } from '@wooksjs/event-core'

const itemsKey = key<string[]>('items')

export const useItems = defineWook((ctx) => ({
  getItems: () => ctx.has(itemsKey) ? ctx.get(itemsKey) : [],
  setItems: (items: string[]) => ctx.set(itemsKey, items),
}))
```

The factory runs once per event. After that, every call to `useItems()` within the same event returns the cached result. This is the same mechanism behind every built-in wook in the framework.

## Context Primitives

The whole context system is built on a handful of simple primitives:

| Primitive | What it does |
|-----------|-------------|
| `key<T>(name)` | A writable typed slot — `set` and `get` values explicitly |
| `cached<T>(fn)` | A read-only slot — computed lazily on first access, cached for the event lifetime |
| `cachedBy<K, V>(fn)` | Like `cached`, but keyed — one cached result per unique argument |
| `defineEventKind(name, slots)` | Declares a named event schema with typed seed slots |
| `defineWook(factory)` | Creates a wook with per-event caching |

No string-keyed stores, no `Object.defineProperty` magic. Under the hood it's a flat `Map` with compile-time type safety layered on top.

## Event Lifecycle

Every interaction in Wooks follows the same simple flow:

1. Create an `EventContext`
2. Seed it with event-specific data
3. Look up and run handlers
4. Wooks pull data from context on demand

This is the same regardless of event type — HTTP, CLI, workflow, or anything custom. You can define your own event kinds with `defineEventKind` and build adapters that follow the same pattern. Wooks that depend only on shared context work across all event types unchanged.

## Domain Adapters

Wooks ships with adapters for the most common event types:

- **[HTTP](/webapp/)** (`@wooksjs/event-http`) — Web servers and REST APIs with request/response wooks, body parsing, static files, and reverse proxy.
- **[CLI](/cliapp/)** (`@wooksjs/event-cli`) — Command-line tools with option/argument wooks, auto-generated help, and the same routing engine as HTTP.
- **[Workflows](/wf/)** (`@wooksjs/event-wf`) — Multi-step pipelines with step/flow wooks, input handling, and pause/resume.

You can also [build your own adapter](/wooks/advanced/wooks-adapter) for any event-driven scenario.

## Package Structure

| Package | Role |
|---------|------|
| @wooksjs/event-core | Context primitives: `key`, `cached`, `defineWook`, `defineEventKind` |
| [@prostojs/router](https://github.com/prostojs/router) | Standalone high-performance router ([benchmarks](/benchmarks/router)) |
| @wooksjs/event-http | HTTP adapter, request/response wooks ([benchmarks](/benchmarks/wooks-http)) |
| @wooksjs/event-cli | CLI adapter, option/argument wooks |
| @wooksjs/event-wf | Workflow adapter, step/flow wooks |
| @wooksjs/http-body | Body parser wook |
| @wooksjs/http-static | Static file serving |
| @wooksjs/http-proxy | Reverse proxy wook |
