# Primitives — @wooksjs/event-core

> `key`, `cached`, `cachedBy`, `slot`, `defineEventKind` — the building blocks for typed per-event state.

## Concepts

All state lives in `EventContext` — a flat `Map<number, unknown>`. Primitives give you typed accessors into that map:

- **`key<T>`** — a writable slot. You `set` and `get` values explicitly.
- **`cached<T>`** — a read-only slot. Computed lazily on first `get`, cached for the event lifetime.
- **`cachedBy<K,V>`** — like `cached`, but parameterized. One cached result per unique key.
- **`slot<T>`** / **`defineEventKind`** — group multiple keys into a typed seed bundle that can be seeded into a context in one call.

All primitives are defined at module level (not per request). They produce lightweight descriptors with auto-incremented numeric IDs.

## API Reference

### `key<T>(name: string): Key<T>`

Creates a writable typed slot. The `name` is for debugging only — lookup is by numeric ID.

```ts
import { key, EventContext } from '@wooksjs/event-core'

const userId = key<string>('userId')

const ctx = new EventContext({ logger })
ctx.set(userId, 'u-123')
ctx.get(userId) // 'u-123' (typed as string)
```

Throws `Key "name" is not set` if `get` is called before `set`.

Supports `undefined`, `null`, `0`, `''`, `false` — all falsy values are stored correctly.

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

**Async:** The Promise itself is cached — concurrent access deduplicates:

```ts
const rawBody = cached(async (ctx) => {
  const chunks: Buffer[] = []
  for await (const chunk of ctx.get(reqStream)) chunks.push(chunk)
  return Buffer.concat(chunks)
})

// Two concurrent calls → one stream read, one Promise
const [a, b] = await Promise.all([ctx.get(rawBody), ctx.get(rawBody)])
a === b // true
```

**Errors** are cached too — a failed computation throws the same error on subsequent access without re-executing.

**Circular dependencies** are detected and throw immediately: `Circular dependency detected for "name"`.

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

The returned function accepts an optional `ctx` parameter to skip `AsyncLocalStorage` lookup:

```ts
const ctx = current()
getCookie('session', ctx) // explicit context, no ALS overhead
```

### `slot<T>(): SlotMarker<T>`

A phantom type marker used in `defineEventKind` schemas. Has no runtime behavior — it only carries the type `T`.

```ts
import { slot } from '@wooksjs/event-core'

const schema = {
  method: slot<string>(),
  path: slot<string>(),
  req: slot<IncomingMessage>(),
}
```

### `defineEventKind<S>(name: string, schema: S): EventKind<S>`

Groups slots into a named kind. Creates a `Key<T>` for each slot in the schema, namespaced under the kind name.

```ts
import { defineEventKind, slot } from '@wooksjs/event-core'

const httpKind = defineEventKind('http', {
  method: slot<string>(),
  path: slot<string>(),
  rawHeaders: slot<Record<string, string>>(),
})

// httpKind.name === 'http'
// httpKind.keys.method is Key<string> with _name 'http.method'
// httpKind.keys.path is Key<string> with _name 'http.path'
```

Seed into a context with `ctx.seed()`:

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
childCtx.seed(workflowKind, { triggerId: 'deploy-42', payload: { env: 'prod' } })

// Child sees both its own and parent data via the parent chain
childCtx.get(httpKind.keys.method) // 'POST' (from parent)
childCtx.get(workflowKind.keys.triggerId) // 'deploy-42' (local)
```

## Common Patterns

### Pattern: Derived computation chain

Cached values can depend on keys and on other cached values. The dependency graph is resolved lazily.

```ts
const base = key<number>('base')
const doubled = cached((ctx) => ctx.get(base) * 2)
const quadrupled = cached((ctx) => ctx.get(doubled) * 2)

ctx.set(base, 5)
ctx.get(quadrupled) // 20 — computes doubled (10) then quadrupled (20)
```

### Pattern: Library extension via cached slots

Libraries export `cached` slots for other libraries to depend on:

```ts
// http-context library
export const rawBody = cached(async (ctx) => readStream(ctx.get(httpKind.keys.req)))

// body-parser library (depends on http-context)
import { rawBody } from 'http-context'

const parsedBody = cached(async (ctx) => {
  const buf = await ctx.get(rawBody)
  return JSON.parse(buf.toString())
})
```

### Pattern: Sparse access with cachedBy

When the data source is large but your app reads few entries:

```ts
// Parses only requested cookies, not all 40
const getCookie = cachedBy((name: string, ctx) => {
  const header = ctx.get(rawHeaders)['cookie'] ?? ''
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`))
  return match?.[1]
})
```

## Best Practices

- Define keys/cached/cachedBy at **module level**, not inside handlers — they're descriptors, not values
- Use `cached` for anything computed from request data — it guarantees single computation
- Use `cachedBy` when computation varies by a parameter (cookie name, header name, etc.)
- Async `cached` values cache the Promise — safe for concurrent access
- Errors from `cached` are also cached — a failing computation won't retry

## Gotchas

- `key` throws on `get` if never `set` — use `ctx.has(k)` to check first
- `cached` functions receive `ctx` as parameter — don't call `current()` inside them, use the provided `ctx`
- Circular `cached` dependencies throw immediately — the cycle is detected at runtime
- `cachedBy` uses a `Map` — keys are compared by identity (`===`), not deep equality
