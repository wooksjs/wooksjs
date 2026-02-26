# Event Context Management — @wooksjs/event-core

> Core machinery behind the Wooks framework: `EventContext`, `key`/`cached`/`cachedBy` primitives, `defineWook` composable factory, `defineEventKind`/`slot` for structured seeding, `run`/`current` for async propagation. This document is domain-agnostic — it applies equally to HTTP, CLI, workflow, and any custom event adapter built on Wooks.

## Mental Model

Every event in Wooks (an HTTP request, a CLI invocation, a workflow step) gets its own `EventContext` — a lightweight container backed by `Map<number, unknown>`. The context is propagated through the async call stack via Node.js `AsyncLocalStorage`.

**Composable functions** (the `use*()` pattern) are the primary way to interact with the context. Each composable reads from or writes to typed slots via `key()` and `cached()`. Values are **computed lazily** — only when first accessed — and then **cached** in the context for the lifetime of the event.

```
Event arrives
  → new EventContext(options)
    → ctx.seed(kind, seeds)
      → run(ctx, handler)
        → handler calls composables
          → composables call current() to get the EventContext
            → ctx.get(key) / ctx.get(cached) to read slots
              → cached() computes on first access, returns cached on subsequent calls
```

This architecture means:

- No global mutable state — each event is fully isolated
- No parameter drilling — composables access context from anywhere in the call chain
- No wasted computation — if a handler never reads cookies, they're never parsed
- Composables can call other composables — the caching ensures no redundant work

## Installation

```bash
npm install @wooksjs/event-core
```

Note: You typically don't install `event-core` directly. It's a peer dependency of adapters like `@wooksjs/event-http`, `@wooksjs/event-cli`, etc. But you import from it when creating custom composables.

## Primitives

All state lives in `EventContext` — a flat `Map<number, unknown>`. Primitives give you typed accessors into that map.

### `key<T>(name: string): Key<T>`

Creates a writable typed slot. The `name` is for debugging only — lookup is by numeric ID.

```ts
import { key } from '@wooksjs/event-core'

const userId = key<string>('userId')

// In a context:
ctx.set(userId, 'u-123')
ctx.get(userId) // 'u-123' (typed as string)
```

Throws `Key "name" is not set` if `get` is called before `set`. Supports `undefined`, `null`, `0`, `''`, `false` — all falsy values are stored correctly.

### `cached<T>(fn: (ctx: EventContext) => T): Cached<T>`

Creates a lazy computed slot. The function runs on first `ctx.get()` and the result is cached.

```ts
import { cached, key } from '@wooksjs/event-core'

const url = key<string>('url')
const parsedQuery = cached((ctx) => {
  return Object.fromEntries(new URL(ctx.get(url)).searchParams)
})

// First access: computes and caches
ctx.get(parsedQuery)
// Second access: returns cached result, fn never runs again
ctx.get(parsedQuery)
```

**Async:** The Promise itself is cached — concurrent access deduplicates.

**Errors** are cached too — a failed computation throws the same error on subsequent access without re-executing.

**Circular dependencies** are detected and throw immediately.

### `cachedBy<K, V>(fn: (key: K, ctx: EventContext) => V): (key: K, ctx?: EventContext) => V`

Like `cached`, but parameterized. Maintains a `Map<K, V>` per context — each unique key computes once.

```ts
import { cachedBy } from '@wooksjs/event-core'

const getCookie = cachedBy((name: string, ctx) => {
  const header = ctx.get(rawHeaders)['cookie'] ?? ''
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`))
  return match?.[1]
})

getCookie('session') // extracts + caches
getCookie('session') // cache hit
getCookie('theme') // extracts + caches (different key)
```

### `slot<T>()` and `defineEventKind(name, schema)`

Group multiple keys into a typed seed bundle:

```ts
import { defineEventKind, slot } from '@wooksjs/event-core'

const httpKind = defineEventKind('http', {
  method: slot<string>(),
  path: slot<string>(),
  rawHeaders: slot<Record<string, string>>(),
})

// httpKind.keys.method is Key<string>
// httpKind.keys.path is Key<string>
```

Seed into a context:

```ts
ctx.seed(httpKind, {
  method: 'POST',
  path: '/api/users',
  rawHeaders: { 'content-type': 'application/json' },
})

ctx.get(httpKind.keys.method) // 'POST'
```

Multiple kinds can be layered via **parent-linked contexts** instead of seeding everything into one context:

```ts
const parentCtx = new EventContext({ logger })
parentCtx.seed(httpKind, { method: 'POST', path: '/webhook', rawHeaders: {} })

const childCtx = new EventContext({ logger, parent: parentCtx })
childCtx.seed(workflowKind, { triggerId: 'deploy-42' })

// Child sees both its own and parent data via the parent chain
childCtx.get(httpKind.keys.method) // 'POST' (from parent)
childCtx.get(workflowKind.keys.triggerId) // 'deploy-42' (local)
```

## EventContext

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

When `parent` is provided, the child context forms a **parent chain**. Lookups via `get()`, `set()`, and `has()` traverse the chain (local first, then parent, then grandparent, etc.):

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

- `ctx.get(accessor)` — Get by key or cached. Traverses parent chain.
- `ctx.set(key, value)` — Set a value. Writes to first context in chain where key exists, or locally if new.
- `ctx.has(accessor)` — Check if set. Traverses parent chain.
- `ctx.getOwn(accessor)` — Local only `get`. Does not traverse parents.
- `ctx.setOwn(key, value)` — Local only `set`. Always writes locally.
- `ctx.hasOwn(accessor)` — Local only `has`.
- `ctx.seed(kind, seeds[, fn])` — Populate from an EventKind schema.
- `ctx.logger` — The Logger instance.

## Runtime

### `run(ctx, fn)`

Execute `fn` within the `AsyncLocalStorage` scope of `ctx`:

```ts
import { run, current, EventContext } from '@wooksjs/event-core'

const ctx = new EventContext({ logger })
const result = run(ctx, () => {
  current() === ctx // true
  return 'hello'
})
```

### `current()`

Get the active `EventContext`. Throws if called outside a `run` scope.

### `tryGetCurrent()`

Like `current()` but returns `undefined` instead of throwing.

### `createEventContext(options, fn)`

Convenience: creates a context and runs `fn` inside `AsyncLocalStorage`:

```ts
import { createEventContext } from '@wooksjs/event-core'

createEventContext({ logger }, () => {
  const ctx = current()
  // ...
})

// With kind + seeds:
createEventContext({ logger }, httpKind, { method: 'GET', path: '/' }, () => {
  current().get(httpKind.keys.method) // 'GET'
})
```

### `useLogger(ctx?)`

Shorthand for `(ctx ?? current()).logger`:

```ts
import { useLogger } from '@wooksjs/event-core'

const logger = useLogger()
logger.info('processing event')
```

## Creating Custom Composables

### `defineWook<T>(factory: (ctx: EventContext) => T): (ctx?: EventContext) => T`

Creates a composable with per-event caching. The factory runs once per `EventContext`, and the result is cached:

```ts
import { defineWook, key } from '@wooksjs/event-core'

const userIdKey = key<string>('auth.userId')

const useCurrentUser = defineWook((ctx) => {
  return {
    getUserId: () => ctx.get(userIdKey),
    isAdmin: () => ctx.get(userIdKey) === 'admin',
  }
})

// In a handler:
const { getUserId, isAdmin } = useCurrentUser()
```

**Caching guarantee:** The factory runs exactly once per event context. Subsequent calls return the same object:

```ts
const a = useCurrentUser()
const b = useCurrentUser()
a === b // true — same object reference
```

**Optional explicit context:** Pass `ctx` to skip the `AsyncLocalStorage` lookup:

```ts
const ctx = current()
const { method } = useRequest(ctx)
const { parseBody } = useBody(ctx)
```

### Pattern: Composable with lazy cached properties

Combine `defineWook` with `cached` for deferred computation:

```ts
import { defineWook, cached } from '@wooksjs/event-core'

const parsedBody = cached(async (ctx) => {
  const buf = await ctx.get(rawBody)
  return JSON.parse(buf.toString())
})

const useBody = defineWook((ctx) => ({
  parseBody: () => ctx.get(parsedBody),
}))

// In handler:
const { parseBody } = useBody()
const body = await parseBody() // parses once
const again = await parseBody() // cache hit, same object
```

### Pattern: Mutable state with key()

Use `key()` when you need a read/write slot that handlers can modify during execution:

```ts
import { key, defineWook } from '@wooksjs/event-core'

const errorsKey = key<string[]>('validation.errors')

export const useValidation = defineWook((ctx) => {
  ctx.set(errorsKey, [])

  return {
    addError: (msg: string) => ctx.get(errorsKey).push(msg),
    getErrors: () => ctx.get(errorsKey),
    hasErrors: () => ctx.get(errorsKey).length > 0,
  }
})
```

### Pattern: Composable calling another composable

Composables can call other composables inside their factory. Pass `ctx` to avoid redundant `AsyncLocalStorage` lookups:

```ts
const useCurrentUser = defineWook((ctx) => {
  const { basicCredentials } = useAuthorization(ctx)
  const username = basicCredentials()?.username
  return {
    username,
    profile: async () => (username ? await db.findUser(username) : null),
  }
})
```

### Pattern: Plain function for single-value access

`defineWook` adds caching overhead. For trivial single-value access, use a plain function:

```ts
// Better — one Map.get, no caching layer
function useMethod(ctx?: EventContext): string {
  return (ctx ?? current()).get(http.keys.method) ?? 'GET'
}
```

## Built-in Composables

These ship with `@wooksjs/event-core` and work in any adapter:

### `useRouteParams<T>(ctx?)`

Access route parameters set by the router:

```ts
import { useRouteParams } from '@wooksjs/event-core'

const { params, get } = useRouteParams<{ id: string }>()
console.log(get('id')) // '123'
console.log(params) // { id: '123' }
```

### `useEventId(ctx?)`

Returns a lazy UUID for the current event:

```ts
import { useEventId } from '@wooksjs/event-core'

const { getId } = useEventId()
console.log(getId()) // '550e8400-e29b-41d4-a716-446655440000'
// Second call returns the same ID
```

### `useLogger(ctx?)`

Returns the logger from the current event context:

```ts
import { useLogger } from '@wooksjs/event-core'

const logger = useLogger()
logger.info('processing event')
logger.warn('something unusual')
logger.error('something failed')
```

## Creating an Event Context (for adapter authors)

Each adapter exports a **context factory** that hardcodes the event kind and delegates to `createEventContext`. The factory signature mirrors `createEventContext` but omits the `kind` parameter:

```ts
import { createEventContext, defineEventKind, slot } from '@wooksjs/event-core'
import type { EventContextOptions, EventKindSeeds } from '@wooksjs/event-core'

const myKind = defineEventKind('my-event', {
  data: slot<unknown>(),
  source: slot<string>(),
})

// Context factory — kind is hardcoded inside
export function createMyEventContext<R>(
  options: EventContextOptions,
  seeds: EventKindSeeds<typeof myKind>,
  fn: () => R,
): R {
  return createEventContext(options, myKind, seeds, fn)
}

// Usage in the adapter
function handleEvent(data: unknown, source: string, handler: () => unknown) {
  return createMyEventContext({ logger: console }, { data, source }, handler)
}
```

All built-in adapters follow this pattern: `createHttpContext`, `createCliContext`, `createWsConnectionContext`, `createWsMessageContext`, `createWfContext`, `resumeWfContext`.

### Parent context (nested events)

Create child contexts by passing `parent` in the options. Each child sees its own data plus everything in the parent chain:

```ts
createEventContext({ logger }, httpKind, httpSeeds, () => {
  const parentCtx = current()

  // Child context linked to the HTTP parent
  createEventContext({ logger, parent: parentCtx }, workflowKind, wfSeeds, () => {
    // Both HTTP and workflow composables work
    const { method } = useRequest() // found via parent chain
    const { ctx } = useWfState() // found locally
  })
})
```

## Best Practices

- **Define keys/cached/cachedBy at module level** — they're descriptors, not values. Don't create them inside handlers.
- **Use `cached` for anything computed from event data** — it guarantees single computation and deduplicates async work.
- **Use `defineWook` when the factory returns an object with multiple properties or methods** — use plain functions for trivial single-value access.
- **Always accept optional `ctx` parameter** in composables for performance — pass `ctx` explicitly when calling multiple composables in sequence.
- **Prefer parent-linked child contexts** over seeding multiple kinds into one context — keeps each layer's data isolated while still accessible.
- **Keep computed values idempotent** — the factory passed to `cached()` runs exactly once and is cached permanently for the event.

## Gotchas

- **Composables must be called within an event context** — Calling any composable outside a `run()` scope throws `[Wooks] No active event context`.
- **Context is async-chain scoped** — The context is bound to the async execution chain via `AsyncLocalStorage`. If you break the chain (e.g., `setTimeout` with a separate callback), the context may be lost. Use `AsyncResource.bind()` if needed.
- **`cached()` caches permanently for the event** — If computation fails, the error is cached too. No retry.
- **`key()` throws on `get` if never `set`** — use `ctx.has(k)` to check first.
- **`cached()` functions receive `ctx` as parameter** — don't call `current()` inside them, use the provided `ctx`.
- **Circular `cached` dependencies throw immediately** — the cycle is detected at runtime.
- **`set()` traverses the parent chain** — it writes to the first context where the key exists. Use `setOwn()` to shadow a parent value locally.
- **Don't hold references across events** — Values from the context are scoped to one event. Don't cache them in module-level variables.
