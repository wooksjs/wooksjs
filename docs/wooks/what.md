# What is Wooks?

Wooks is a TypeScript-first event framework for Node.js. The name comes from **w**(eb) (h)**ooks** — but the concept extends far beyond HTTP. Wooks handles HTTP requests, CLI commands, workflows, and custom event types through a single architecture.

## What is a Wook?

A **wook** is a composable-like function — inspired by Vue's Composition API — designed for backend Node.js. You call it inside an event handler and get back typed, per-event data. No arguments, no event object, no middleware registration.

```ts
const { params, get } = useRouteParams<{ id: string }>()
const logger = useLogger()
logger.info('Processing event for', get('id'))
```

Wooks are lazy — they do work only when asked. Nothing is parsed or computed until you call a wook.

Under the hood, each wook reads from an `EventContext` — a per-event `Map` of typed slots, propagated via `AsyncLocalStorage`. You never see it, but it's why wooks work anywhere in the call stack, through any number of `await` boundaries — just like Vue composables work anywhere inside a `setup()` function.

## `defineWook`

Every built-in wook is created with `defineWook` — and so are yours:

```ts
import { defineWook, key } from '@wooksjs/event-core'

const itemsKey = key<string[]>('items')

export const useItems = defineWook((ctx) => ({
  getItems: () => ctx.has(itemsKey) ? ctx.get(itemsKey) : [],
  setItems: (items: string[]) => ctx.set(itemsKey, items),
}))
```

The factory runs once per event. Every subsequent call to `useItems()` within the same event returns the cached result. This is the same mechanism that powers every built-in wook in the framework.

## Context Primitives

The context system is built on a small set of primitives:

| Primitive | What it does |
|-----------|-------------|
| `key<T>(name)` | A writable typed slot — you `set` and `get` values explicitly |
| `cached<T>(fn)` | A read-only slot — computed lazily on first access, cached for the event lifetime |
| `cachedBy<K, V>(fn)` | Like `cached`, but keyed — one result per unique argument |
| `defineEventKind(name, slots)` | Declares a named event schema with typed seed slots |
| `defineWook(factory)` | Creates a wook with per-event caching |

There are no string-keyed stores, no `Object.defineProperty` hooks. The context is a flat `Map<number, unknown>` with compile-time type safety layered on top.

## Event Lifecycle

Every interaction in Wooks follows the same lifecycle:

1. Create an `EventContext`
2. Seed it with event-specific data
3. Look up and run handlers
4. Wooks pull data from context on demand

This lifecycle is the same regardless of the event type. You can define your own event kinds with `defineEventKind` and build adapters that follow the same pattern. Wooks that depend only on shared context work across all event types unchanged.

## Domain Adapters

Wooks ships with several built-in adapters, each tailored for a specific event domain:

- **[HTTP](/webapp/)** (`@wooksjs/event-http`) — Build web servers and REST APIs with request/response wooks, body parsing, static file serving, and reverse proxy support.
- **[CLI](/cliapp/)** (`@wooksjs/event-cli`) — Build command-line tools with option/argument wooks, auto-generated help, and the same routing as HTTP.
- **[Workflows](/wf/)** (`@wooksjs/event-wf`) — Build multi-step pipelines with step/flow wooks, input handling, and pause/resume support.

You can also [create your own adapter](/wooks/advanced/wooks-adapter) for any event-driven scenario.

## Package Structure

| Package | Role |
|---------|------|
| @wooksjs/event-core | Context primitives: `key`, `cached`, `defineWook`, `defineEventKind` |
| [@prostojs/router](https://github.com/prostojs/router) | Standalone high-performance router |
| @wooksjs/event-http | HTTP adapter, request/response wooks |
| @wooksjs/event-cli | CLI adapter, option/argument wooks |
| @wooksjs/event-wf | Workflow adapter, step/flow wooks |
| @wooksjs/http-body | Body parser wook |
| @wooksjs/http-static | Static file serving |
| @wooksjs/http-proxy | Reverse proxy wook |
