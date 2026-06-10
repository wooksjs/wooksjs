
# Event Context

`@wooksjs/event-core` provides the primitives for creating, managing, and accessing event contexts in Wooks. It enables strongly typed, per-event storage that persists through async calls without manual propagation. This guide targets advanced users who want to understand `event-core` or create custom event integrations.

## Core Concepts

Every event in Wooks runs inside an `EventContext` — a lightweight container backed by `AsyncLocalStorage`. The context holds typed **slots** that wooks read and write. There is no string-keyed store; instead, every piece of data has a typed `Key` or `Cached` slot.

### Primitives

| Primitive | Purpose |
|-----------|---------|
| `key<T>(name)` | Creates a typed slot for explicit read/write values |
| `cached<T>(fn)` | Creates a lazily-computed slot (runs `fn` once per context, caches result) |
| `cachedBy<K, V>(fn)` | Like `cached`, but parameterized — one cached result per unique key |
| `slot<T>()` | Marker used inside `defineEventKind` schemas |
| `defineEventKind(name, schema)` | Declares a named event kind with typed seed slots |
| `defineWook<T>(factory)` | Creates a cached wook (factory runs once per context) |

## Creating an Event Context

### `createEventContext()`

Creates a new `EventContext`, makes it the active context via `AsyncLocalStorage`, and runs the provided callback inside it.

**Signatures:**

```ts
// Simple context (no event kind)
function createEventContext<R>(
  options: EventContextOptions,
  fn: () => R,
): R

// Context with an event kind and seed values
function createEventContext<S extends Record<string, any>, R>(
  options: EventContextOptions,
  kind: EventKind<S>,
  seeds: EventKindSeeds<EventKind<S>>,
  fn: () => R,
): R
```

The kindless overload is a convenience for tests — it performs no seeding and skips `ContextInjector` instrumentation. Production adapters should always provide an event kind.

**Example:**

```ts
import { createEventContext, defineEventKind, slot } from '@wooksjs/event-core'

const myKind = defineEventKind('my-event', {
  payload: slot<unknown>(),
})

createEventContext({ logger }, myKind, { payload: data }, () => {
  // Inside this callback, the event context is active
  // All wooks and current() work here
})
```

### `run()`

```ts
function run<R>(ctx: EventContext, fn: () => R): R
```

Use `run()` when you already have an `EventContext` — e.g. one created with `new EventContext(options)` — and need to activate it for a callback. All wooks and `current()` calls inside `fn` resolve to `ctx`. `createEventContext()` uses it internally.

### `current()` and `tryGetCurrent()`

```ts
function current(): EventContext       // throws if no active context
function tryGetCurrent(): EventContext | undefined  // returns undefined if none
```

`current()` returns the active `EventContext`. All wooks use it internally.

## Working with the EventContext

### Reading and Writing Slots

```ts
const ctx = current()

// Explicit key — you set and get values manually
ctx.set(myKey, value)
const val = ctx.get(myKey)

// Cached slot — computed lazily on first access
const val = ctx.get(myCachedSlot) // runs the factory function once, caches result
```

### Checking Slots

`ctx.has(accessor)` returns `true` if the slot has been set or computed — in this context or any parent. Use it to read optional state without triggering the "Key is not set" error:

```ts
const status = ctx.has(statusKey) ? ctx.get(statusKey) : 'pending'
```

### `key<T>(name)`

Creates a named, typed slot for storing explicit values. You must `set` the value before `get`-ting it (otherwise an error is thrown).

```ts
import { key } from '@wooksjs/event-core'

const userIdKey = key<string>('userId')

// In context:
ctx.set(userIdKey, '123')
ctx.get(userIdKey) // '123'
```

### `cached<T>(fn)`

Creates a lazily-computed slot. The factory function runs once per context on first access. The result is cached — subsequent calls return the same value.

```ts
import { cached } from '@wooksjs/event-core'

const parsedUrl = cached((ctx) => new URL(ctx.get(requestUrlKey)))

// In context:
ctx.get(parsedUrl) // computes on first call, cached after
ctx.get(parsedUrl) // returns cached result
```

If the factory throws, the error is cached and re-thrown on subsequent access. Circular dependencies are detected and throw immediately.

### `cachedBy<K, V>(fn)`

A parameterized version of `cached`. Maintains a `Map<K, V>` per context — one cached result per unique key argument.

```ts
import { cachedBy } from '@wooksjs/event-core'

const parseCookieValue = cachedBy((name: string, ctx) => {
  const cookie = ctx.get(reqKey).headers.cookie
  // ... parse the cookie named `name`
  return value
})

// In context:
parseCookieValue('session')  // computed and cached for 'session'
parseCookieValue('theme')    // computed and cached for 'theme'
parseCookieValue('session')  // returns cached result
```

## Parent Contexts

`EventContextOptions` accepts an optional `parent` context, forming a chain. This is how child events — workflow steps started from an HTTP request, or WebSocket messages tied to their upgrade request — transparently expose the parent's data:

```ts
const child = new EventContext({ logger, parent: parentCtx })
```

- `get()` reads through the chain — if a slot is not found locally, parent contexts are consulted.
- `set()` writes to the nearest context in the chain that already holds the slot; if none does, the value is stored locally.
- `has()` checks the whole chain.

To bypass the chain, use the `*Own` variants, which operate on the current context only:

```ts
ctx.getOwn(myKey)        // ignores parents
ctx.setOwn(myKey, value) // always stores locally
ctx.hasOwn(myKey)        // true only if set/computed locally
```

See [HTTP Integration for workflows](/wf/http-integration) and [WebSocket composables](/wsapp/composables) for applied examples of parent-chain contexts.

## Defining Event Kinds

An `EventKind` declares the shape of an event — the named slots that must be seeded when the context is created.

```ts
import { defineEventKind, slot } from '@wooksjs/event-core'

const httpKind = defineEventKind('http', {
  req: slot<IncomingMessage>(),
  response: slot<HttpResponse>(),
  requestLimits: slot<TRequestLimits | undefined>(),
})
```

Each property in the schema becomes a typed `Key` accessible via `kind.keys`:

```ts
const req = ctx.get(httpKind.keys.req) // IncomingMessage
```

### Seeding with `ctx.seed()`

When creating an event context for a specific kind, seed values are provided via `ctx.seed(kind, seeds)`:

```ts
ctx.seed(httpKind, {
  req: incomingMessage,
  response: httpResponse,
  requestLimits: limits,
})
```

This is typically done inside `createEventContext()` or inside an adapter's request handler.

## Standard Keys

`@wooksjs/event-core` exports two predefined keys available across all event types:

- `routeParamsKey` — route parameters, written by `Wooks.lookup()`/`lookupHandlers()` during routing and read by `useRouteParams()`.
- `eventTypeKey` — the event kind name (`'http'`, `'CLI'`, `'WF'`, `'ws:connection'`, `'ws:message'`), set by `ctx.seed()`. Useful for detecting the current event type.

```ts
import { eventTypeKey } from '@wooksjs/event-core'

const type = current().get(eventTypeKey) // e.g. 'http'
```

## Building Wooks

### `defineWook<T>(factory)`

The recommended way to create wooks. Wraps a factory function with per-context caching — the factory runs once per event context, and subsequent calls return the cached result.

```ts
import { defineWook } from '@wooksjs/event-core'

export const useMyFeature = defineWook((ctx) => {
  const req = ctx.get(httpKind.keys.req)

  return {
    getHeader: (name: string) => req.headers[name],
    getMethod: () => req.method,
  }
})
```

Usage:

```ts
const { getHeader, getMethod } = useMyFeature()
```

The optional `ctx` parameter lets you pass an explicit context (useful in tests):

```ts
const result = useMyFeature(testCtx)
```

`defineWook` returns a `WookComposable<T>` — callable as `(ctx?) => T` — that also exposes a readonly `_slot` property: the underlying `Cached` slot. This is useful in advanced scenarios such as building slot-isolation lists for child contexts.

## Best Practices

1. **Use `defineWook` for wooks.** It handles caching automatically — your factory runs once per event, and the returned object is reused.

2. **Use `cached` for derived data.** If a value can be computed from other context data, make it a `cached` slot rather than computing it in multiple places.

3. **Use `key` for mutable state.** When you need to store values that change during event processing (e.g., a status field), use explicit keys.

4. **Type everything.** All primitives are generic — `key<T>`, `cached<T>`, `slot<T>` — so consumers get full type safety with no casts.

5. **Avoid accessing context outside event scope.** `current()` throws if called outside an active context. Guard with `tryGetCurrent()` when context may not be available.
