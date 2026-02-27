# What is Wooks?

Wooks is a TypeScript-first event-processing framework for Node.js built around one idea: **event context should be a first-class system**.

The name comes from **w**(eb) (h)**ooks** — but the concept extends far beyond HTTP. Wooks handles HTTP requests, CLI commands, WebSocket messages, workflows, and custom event types through a single architecture.

## The Problem

When you handle an HTTP request, you need context — route params, body, cookies, authorization, user info, IP, accept headers. As your app grows, so does the context you need per event.

Traditional frameworks don't have a real answer for this:

- **Express / Fastify**: properties on `req`. No type safety. No structure. Every middleware mutates a shared object — `req.user`, `req.body`, `req.parsedQuery` — and you hope it's all there by the time your handler runs. Want to add a new piece of context? Bolt on another middleware, extend another interface, hope for the best.
- **h3**: a dedicated `event` object — cleaner. But extending it type-safely? Building lazy, cached computed properties on it? There are no built-in tools for that. You're back to ad-hoc code.

This is the problem Wooks solves.

## The Solution: Typed Event Context

Wooks provides a **typed event context** with built-in primitives for declaring typed slots, lazy computation, and automatic caching. Every event — HTTP request, CLI command, workflow step — gets a context that's type-safe, extensible, and lazy by design.

The composable API (`useRequest()`, `useBody()`, `useAuthorization()`) is the natural interface that emerges from this context system. You don't pass `req` or `event` — you call functions that read from the current event's context, available anywhere in the call stack via `AsyncLocalStorage`.

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
| [@prostojs/router](https://github.com/prostojs/router) | Standalone high-performance router ([benchmarks](/benchmarks/router)) |
| @wooksjs/event-http | HTTP adapter, request/response wooks ([benchmarks](/benchmarks/wooks-http)) |
| @wooksjs/event-cli | CLI adapter, option/argument wooks |
| @wooksjs/event-wf | Workflow adapter, step/flow wooks |
| @wooksjs/http-body | Body parser wook |
| @wooksjs/http-static | Static file serving |
| @wooksjs/http-proxy | Reverse proxy wook |
