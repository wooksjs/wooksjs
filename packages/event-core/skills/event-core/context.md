# Context & runtime — @wooksjs/event-core

> `EventContext` class, `run`/`current`/`createEventContext`, async propagation, and performance.

## Concepts

Every event in Wooks gets its own `EventContext` — a lightweight container backed by `Map<number, unknown>`. The context is propagated through the async call stack via Node.js `AsyncLocalStorage`.

The lifecycle:
1. Create an `EventContext` (or use `createEventContext`)
2. Seed it with event-specific data via `ctx.attach(kind, seeds)`
3. Enter the `AsyncLocalStorage` scope with `run(ctx, fn)`
4. Inside `fn`, composables resolve the context via `current()`

Adapters (HTTP, CLI, etc.) handle steps 1-3. Your handler code only interacts with composables.

## API Reference

### `EventContext`

```ts
import { EventContext } from '@wooksjs/event-core'

const ctx = new EventContext({ logger })
```

**Constructor options:**

```ts
interface EventContextOptions {
  logger: Logger
}
```

Every context requires a `Logger`. Access it via `ctx.logger`.

**Methods:**

#### `ctx.get<T>(accessor: Key<T> | Cached<T>): T`

Get a value by key or cached accessor.
- For `Key<T>`: returns the value set via `ctx.set()`. Throws `Key "name" is not set` if never set.
- For `Cached<T>`: computes on first access, caches the result. Subsequent calls return cached value.

#### `ctx.set<T>(key: Key<T>, value: T): void`

Set a value for a key. Overwrites any previous value. Works with `undefined`, `null`, and falsy values.

#### `ctx.has(accessor: Accessor<any>): boolean`

Check if a slot has been set or computed. Returns `false` for unset keys and uncomputed cached values.

#### `ctx.attach(kind, seeds[, fn])`

Populate context from an `EventKind` schema:

```ts
const http = defineEventKind('http', {
  method: slot<string>(),
  path: slot<string>(),
})

ctx.attach(http, { method: 'GET', path: '/api' })
ctx.get(http.keys.method) // 'GET'
```

Also sets `eventTypeKey` to the kind's name.

Overloaded: can accept an optional callback that runs immediately after seeding:

```ts
ctx.attach(http, seeds, () => {
  // seeds are available here
})
```

### `run<R>(ctx: EventContext, fn: () => R): R`

Execute `fn` within the `AsyncLocalStorage` scope of `ctx`. Returns the fn's return value. Works with async functions.

```ts
const ctx = new EventContext({ logger })
const result = run(ctx, () => {
  // current() returns ctx here
  return 'hello'
})
// result === 'hello'
```

Supports nesting — inner `run` creates a child scope:

```ts
run(outer, () => {
  current() === outer  // true
  run(inner, () => {
    current() === inner  // true
  })
  current() === outer  // true (restored)
})
```

### `current(): EventContext`

Get the active `EventContext` from the `AsyncLocalStorage` scope. Throws `[Wooks] No active event context` if called outside a `run` scope.

### `tryGetCurrent(): EventContext | undefined`

Like `current()` but returns `undefined` instead of throwing.

### `createEventContext(options, fn): R`
### `createEventContext(options, kind, seeds, fn): R`

Convenience: creates a context, optionally attaches a kind with seeds, and runs `fn` inside `AsyncLocalStorage`:

```ts
// Bare context
createEventContext({ logger }, () => {
  const ctx = current()
  // ...
})

// With kind + seeds
createEventContext({ logger }, httpKind, { method: 'GET', path: '/' }, () => {
  current().get(httpKind.keys.method) // 'GET'
})
```

Returns the fn's return value. Works with async callbacks.

### `useLogger(ctx?: EventContext): Logger`

Shorthand for `(ctx ?? current()).logger`.

## Version safety

`@wooksjs/event-core` uses a global `Symbol.for('wooks.core.asyncStorage')` to ensure a single `AsyncLocalStorage` instance across the process. If two incompatible versions are loaded, it throws at import time:

```
[wooks] Incompatible versions of @wooksjs/event-core detected: existing v0.6.6, loading v0.7.0
```

This prevents subtle bugs from multiple context stores.

## Common Patterns

### Pattern: Custom adapter

Build an adapter that creates contexts and runs handlers:

```ts
import { EventContext, defineEventKind, slot, run } from '@wooksjs/event-core'

const myKind = defineEventKind('my-event', {
  data: slot<unknown>(),
})

function handleEvent(data: unknown, handler: () => unknown) {
  const ctx = new EventContext({ logger: console })
  ctx.attach(myKind, { data })
  return run(ctx, handler)
}
```

### Pattern: Multiple kinds on one context

A single event can carry data from multiple kinds:

```ts
createEventContext({ logger }, httpKind, httpSeeds, () => {
  const ctx = current()
  // Later, attach workflow data to the same context
  ctx.attach(workflowKind, { triggerId: 'deploy-42', payload })

  // Both HTTP and workflow composables work
  const { method } = useRequest()
  const { triggerId } = useWorkflow()
})
```

### Pattern: Resolve context once for hot paths

Each composable call without `ctx` hits `AsyncLocalStorage.getStore()`. For hot paths:

```ts
// 4 ALS lookups
const { method } = useRequest()
const { parseBody } = useBody()
const session = getCookie('session')
const log = useLogger()

// 1 ALS lookup
const ctx = current()
const { method } = useRequest(ctx)
const { parseBody } = useBody(ctx)
const session = getCookie('session', ctx)
const log = ctx.logger
```

## ContextInjector (observability)

`ContextInjector` is a hook point for observability tools (OpenTelemetry, etc.). The default implementation is a no-op pass-through.

```ts
import { ContextInjector, replaceContextInjector } from '@wooksjs/event-core'

class OtelInjector extends ContextInjector<string> {
  with<T>(name: string, attributes: Record<string, any>, cb: () => T): T {
    return tracer.startActiveSpan(name, { attributes }, () => cb())
  }
}

replaceContextInjector(new OtelInjector())
```

The injector's `with()` method wraps `createEventContext` callbacks and handler invocations.

## Best Practices

- Let adapters handle context creation — in handler code, just use composables
- Pass `ctx` explicitly in hot paths with multiple composable calls
- Use `tryGetCurrent()` in library code that may run outside event scope
- Keep `Logger` simple — the interface is `info/warn/error/debug` with optional `topic()`

## Gotchas

- `current()` throws outside `run()` scope — use `tryGetCurrent()` if that's expected
- `AsyncLocalStorage` propagates through `await`, `setTimeout`, `setImmediate`, and Promise chains
- `EventContext` is not thread-safe — it's designed for single-event, single-async-chain use
- The global singleton `AsyncLocalStorage` means all `@wooksjs/event-core` consumers in a process share context — version mismatches are caught at import time
