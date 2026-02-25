# Core concepts & setup — @wooksjs/event-core

> Package overview, mental model, installation, and exports map.

## What it is

`@wooksjs/event-core` is the context engine underneath all Wooks adapters. It provides:

- **Typed slots** (`key<T>`) — explicit get/set per event
- **Lazy cached computations** (`cached`, `cachedBy`) — compute once, cache for event lifetime
- **Event kind schemas** (`defineEventKind`) — typed seed bundles for domain-specific data
- **Composable factories** (`defineWook`) — per-event cached functions, resolved via `AsyncLocalStorage`
- **Async propagation** (`run`, `current`) — context available anywhere in the call stack

## Installation

```bash
pnpm add @wooksjs/event-core
```

Typically you don't install this directly — it's a dependency of `@wooksjs/event-http`, `@wooksjs/event-cli`, etc. Install it when building custom adapters or composables that don't depend on a specific event type.

## Mental model

```
EventContext = Map<number, unknown>  (flat, typed via key/cached accessors)
    │
    ├── key<T>(name)         → writable slot, explicit set/get
    ├── cached<T>(fn)        → read-only slot, lazy, computed on first access
    ├── cachedBy<K,V>(fn)    → like cached but keyed — one result per unique argument
    │
    ├── defineEventKind(name, schema)  → groups slots into a named seed bundle
    │       └── ctx.attach(kind, seeds)  → populates slots from seeds
    │
    └── defineWook(factory)  → creates a composable: factory runs once per context, cached
            └── useX()       → resolves from AsyncLocalStorage, returns cached result
```

Every event (HTTP request, CLI invocation, workflow step) gets its own `EventContext`. The context is propagated via `AsyncLocalStorage` — composables resolve it implicitly.

## Exports

| Export | Kind | Purpose |
|--------|------|---------|
| `key<T>(name)` | primitive | Writable typed slot |
| `cached<T>(fn)` | primitive | Lazy computed slot, cached per event |
| `cachedBy<K,V>(fn)` | primitive | Lazy computed slot, cached per key per event |
| `slot<T>()` | primitive | Type marker for `defineEventKind` schemas |
| `defineEventKind(name, schema)` | primitive | Typed seed bundle definition |
| `defineWook<T>(factory)` | primitive | Composable factory with per-event caching |
| `EventContext` | class | Per-event context container (`get`, `set`, `has`, `attach`) |
| `run(ctx, fn)` | function | Execute `fn` within `ctx` via `AsyncLocalStorage` |
| `current()` | function | Get active `EventContext` (throws if none) |
| `tryGetCurrent()` | function | Get active `EventContext` or `undefined` |
| `createEventContext(opts, [kind, seeds,] fn)` | function | Create context + optional seed + run |
| `useLogger(ctx?)` | composable | Shorthand for `(ctx ?? current()).logger` |
| `useRouteParams(ctx?)` | composable | Route parameters from router |
| `useEventId(ctx?)` | composable | Lazy UUID per event |
| `routeParamsKey` | key | Standard key for route params |
| `eventTypeKey` | key | Standard key for event type name |
| `ContextInjector` | class | Observability hook point (OpenTelemetry etc.) |
| `getContextInjector()` | function | Get current injector |
| `replaceContextInjector(ci)` | function | Replace injector (e.g. with OTel spans) |

## Types

```ts
interface Logger {
  info(msg: string, ...args: unknown[]): void
  warn(msg: string, ...args: unknown[]): void
  error(msg: string, ...args: unknown[]): void
  debug(msg: string, ...args: unknown[]): void
  topic?: (name?: string) => Logger
}

interface Key<T> { readonly _id: number; readonly _name: string }
interface Cached<T> extends Key<T> { readonly _fn: (ctx: EventContext) => T }
type Accessor<T> = Key<T> | Cached<T>
interface SlotMarker<T> {}  // phantom type marker

type EventKind<S> = {
  readonly name: string
  readonly keys: { [K in keyof S]: S[K] extends SlotMarker<infer V> ? Key<V> : never }
}
type EventKindSeeds<K> = // maps SlotMarker<V> → V for each property
```
