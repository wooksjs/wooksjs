# Context & runtime — @wooksjs/event-core

> `EventContext` class, `run`/`current`/`createEventContext`, async propagation, and performance.

## Concepts

Every event in Wooks gets its own `EventContext` — a lightweight container backed by `Map<number, unknown>`. The context is propagated through the async call stack via Node.js `AsyncLocalStorage`.

The lifecycle:

1. Create an `EventContext` (or use `createEventContext`), optionally linking a `parent` context
2. Seed it with event-specific data via `ctx.seed(kind, seeds)`
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
  parent?: EventContext
}
```

Every context requires a `Logger`. Access it via `ctx.logger`.

When `parent` is provided, the child context forms a **parent chain**. Lookups via `get()`, `set()`, and `has()` traverse the chain (local first, then parent, then grandparent, etc.). This replaces the old pattern of attaching multiple kinds to a single context — instead, create child contexts with parent links:

```ts
const parentCtx = new EventContext({ logger })
parentCtx.seed(httpKind, { method: 'GET', path: '/api' })

const childCtx = new EventContext({ logger, parent: parentCtx })
childCtx.seed(workflowKind, { triggerId: 'deploy-42' })

// child can see its own data AND parent data
childCtx.get(httpKind.keys.method) // 'GET' (found in parent)
childCtx.get(workflowKind.keys.triggerId) // 'deploy-42' (found locally)
```

**Methods:**

#### `ctx.get<T>(accessor: Key<T> | Cached<T>): T`

Get a value by key or cached accessor. **Traverses the parent chain:** checks local context first, then parent, grandparent, and so on.

- For `Key<T>`: returns the first value found in the chain. Throws `Key "name" is not set` if not found in any context.
- For `Cached<T>`: if a computed value is found anywhere in the parent chain, returns it (no re-computation). If not found in any context, computes and caches the result **locally**.

#### `ctx.set<T>(key: Key<T> | Cached<T>, value: T): void`

Set a value for a key. **Traverses the parent chain:** if the key already exists somewhere in the chain, writes to that context. If the key is new (not found in any ancestor), writes locally. Works with `undefined`, `null`, and falsy values.

#### `ctx.has(accessor: Accessor<any>): boolean`

Check if a slot has been set or computed. **Traverses the parent chain.** Returns `true` if the slot is found in any context in the chain. Returns `false` for unset keys and uncomputed cached values across the entire chain.

#### `ctx.getOwn<T>(accessor: Key<T> | Cached<T>): T`

Like `get()`, but **local only** — does not traverse the parent chain. Returns the value from this context only. Throws if not set locally.

#### `ctx.setOwn<T>(key: Key<T> | Cached<T>, value: T): void`

Like `set()`, but **local only** — always writes to this context, even if the key exists in a parent.

#### `ctx.hasOwn(accessor: Accessor<any>): boolean`

Like `has()`, but **local only** — returns `true` only if the slot is set in this context, ignoring parents.

#### `ctx.seed(kind, seeds[, fn])`

Populate context from an `EventKind` schema (previously called `attach`):

```ts
const http = defineEventKind('http', {
  method: slot<string>(),
  path: slot<string>(),
})

ctx.seed(http, { method: 'GET', path: '/api' })
ctx.get(http.keys.method) // 'GET'
```

Also sets `eventTypeKey` to the kind's name.

Overloaded: can accept an optional callback that runs immediately after seeding:

```ts
ctx.seed(http, seeds, () => {
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
  current() === outer // true
  run(inner, () => {
    current() === inner // true
  })
  current() === outer // true (restored)
})
```

### `current(): EventContext`

Get the active `EventContext` from the `AsyncLocalStorage` scope. Throws `[Wooks] No active event context` if called outside a `run` scope.

### `tryGetCurrent(): EventContext | undefined`

Like `current()` but returns `undefined` instead of throwing.

### `createEventContext(options, fn): R`

### `createEventContext(options, kind, seeds, fn): R`

Convenience: creates a context, optionally seeds a kind, and runs `fn` inside `AsyncLocalStorage`:

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

function handleEvent(data: unknown, handler: () => unknown, parent?: EventContext) {
  const ctx = new EventContext({ logger: console, parent })
  ctx.seed(myKind, { data })
  return run(ctx, handler)
}
```

### Pattern: Child contexts with parent links

Instead of attaching multiple kinds to a single context, create child contexts with parent links. Each child sees its own data plus everything in the parent chain:

```ts
createEventContext({ logger }, httpKind, httpSeeds, () => {
  const parentCtx = current()

  // Create a child context for workflow-specific data
  const childCtx = new EventContext({ logger, parent: parentCtx })
  childCtx.seed(workflowKind, { triggerId: 'deploy-42', payload })

  run(childCtx, () => {
    // Both HTTP and workflow composables work
    const { method } = useRequest() // found via parent chain
    const { triggerId } = useWorkflow() // found locally
  })
})
```

The parent chain allows layered contexts — for example, a base HTTP context can be shared across sub-handlers, each with their own child context carrying handler-specific state.

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
- Prefer parent-linked child contexts over seeding multiple kinds into one context — the parent chain keeps each layer's data isolated while still accessible
- Use `getOwn()`/`setOwn()`/`hasOwn()` when you need to guarantee local-only access and avoid unintended reads from or writes to parent contexts

## Gotchas

- `current()` throws outside `run()` scope — use `tryGetCurrent()` if that's expected
- `AsyncLocalStorage` propagates through `await`, `setTimeout`, `setImmediate`, and Promise chains
- `EventContext` is not thread-safe — it's designed for single-event, single-async-chain use
- The global singleton `AsyncLocalStorage` means all `@wooksjs/event-core` consumers in a process share context — version mismatches are caught at import time
- `set()` writes to the first context in the parent chain where the key exists — if you need to shadow a parent value locally, use `setOwn()`
- `get()` on a `Cached<T>` found in a parent returns the parent's cached value without re-computing — if you need a fresh local computation, use `getOwn()`
- Parent chain traversal has O(depth) cost per lookup — keep chains shallow for performance
