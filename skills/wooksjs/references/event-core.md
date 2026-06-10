# @wooksjs/event-core -- API Reference

Typed per-event context engine. Foundation for all Wooks adapters.

## Quick start

```ts
import { key, cached, defineWook } from '@wooksjs/event-core'

const userId = key<string>('userId')              // module-level typed slot
const profile = cached((ctx) => loadProfile(ctx)) // lazy, cached per event

export const useUser = defineWook((ctx) => ({
  id: () => ctx.get(userId),
  profile: () => ctx.get(profile),
}))

// inside any adapter handler:
const { id } = useUser()
```

## Contents

- [Primitives](#primitives) — `key`, `cached`, `cachedBy`, `slot`, `defineEventKind`
- [Composables](#composables) — `defineWook`, `useRouteParams`, `useEventId`, `useLogger`
- [Composable Patterns](#composable-patterns) — lazy props, async cached, class-based, deps, plain functions
- [EventContext](#eventcontext) — constructor, `get`/`set`/`has`, `getOwn`/`setOwn`/`hasOwn`, `seed`, parent chain
- [Runtime](#runtime) — `run`, `current`, `tryGetCurrent`, `createEventContext`, version safety
- [Custom adapters (advanced)](#custom-adapters-advanced) — context factory + `WooksAdapterBase`
- [ContextInjector](#contextinjector) — observability hook point
- [Key Imports](#key-imports), [Standard Keys](#standard-keys)
- [Rules & Gotchas](#rules--gotchas), [See also](#see-also)

## Primitives

All primitives are defined at **module level** (not per request). They produce lightweight descriptors with auto-incremented numeric IDs used as Map keys.

### `key<T>(name: string): Key<T>`

Create a writable typed slot. `name` is for debugging only -- lookup is by numeric ID.

```ts
import { key, EventContext } from '@wooksjs/event-core'

const userId = key<string>('userId')

ctx.set(userId, 'u-123')
ctx.get(userId) // 'u-123' (typed as string)
```

- Throws `Key "name" is not set` if `get` called before `set`
- Supports `undefined`, `null`, `0`, `''`, `false` -- all falsy values stored correctly

### `cached<T>(fn: (ctx: EventContext) => T): Cached<T>`

Create a lazy computed slot. Factory runs on first `ctx.get()`, result cached for context lifetime.

```ts
const parsedQuery = cached((ctx) => {
  return Object.fromEntries(new URL(ctx.get(url)).searchParams)
})
```

**Async deduplication:** The Promise itself is cached -- concurrent access deduplicates:

```ts
const rawBody = cached(async (ctx) => {
  const chunks: Buffer[] = []
  for await (const chunk of ctx.get(reqStream)) chunks.push(chunk)
  return Buffer.concat(chunks)
})

// Two concurrent calls -> one stream read, one Promise
const [a, b] = await Promise.all([ctx.get(rawBody), ctx.get(rawBody)])
a === b // true
```

- **Errors are cached** -- a failed computation throws the same error on subsequent access without re-executing
- **Circular dependencies** detected at runtime: `Circular dependency detected for "name"`

### `cachedBy<K, V>(fn: (key: K, ctx: EventContext) => V): (key: K, ctx?: EventContext) => V`

Parameterized cached computation. Maintains a `Map<K, V>` per context -- one cached result per unique key.

```ts
const getCookie = cachedBy((name: string, ctx) => {
  const header = ctx.get(rawHeaders)['cookie'] ?? ''
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`))
  return match?.[1]
})

getCookie('session')       // computes + caches
getCookie('session')       // cache hit
getCookie('theme')         // computes + caches (different key)
getCookie('session', ctx)  // explicit context, no ALS overhead
```

- Keys compared by identity (`===`), not deep equality
- Useful for sparse access -- parse only requested cookies, not all 40

### `slot<T>(): SlotMarker<T>`

Phantom type marker for `defineEventKind` schemas. No runtime behavior -- carries type `T` only.

```ts
const schema = {
  method: slot<string>(),
  path: slot<string>(),
  req: slot<IncomingMessage>(),
}
```

### `defineEventKind<S>(name: string, schema: S): EventKind<S>`

Group slots into a named kind. Creates a `Key<T>` for each slot in the schema, namespaced under the kind name.

```ts
const httpKind = defineEventKind('http', {
  method: slot<string>(),
  path: slot<string>(),
  rawHeaders: slot<Record<string, string>>(),
})

// httpKind.keys.method is Key<string> with _name 'http.method'
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

Multiple kinds layered via parent-linked contexts:

```ts
const parentCtx = new EventContext({ logger })
parentCtx.seed(httpKind, { method: 'POST', path: '/webhook', rawHeaders: {} })

const childCtx = new EventContext({ logger, parent: parentCtx })
childCtx.seed(workflowKind, { triggerId: 'deploy-42', payload: { env: 'prod' } })

childCtx.get(httpKind.keys.method)          // 'POST' (from parent)
childCtx.get(workflowKind.keys.triggerId)   // 'deploy-42' (local)
```

---

## Composables

### `defineWook<T>(factory: (ctx: EventContext) => T): WookComposable<T>`

Create a composable with per-event caching. Factory runs once per `EventContext`, result cached.

```ts
interface WookComposable<T> {
  (ctx?: EventContext): T
  readonly _slot: Cached<T>  // underlying slot, useful for isolation in child contexts
}
```

```ts
const useRequest = defineWook((ctx) => ({
  method: ctx.get(http.keys.method),
  path: ctx.get(http.keys.path),
}))

// In handler:
const { method, path } = useRequest()

// Caching guarantee:
const a = useRequest()
const b = useRequest()
a === b // true -- same object reference
```

Pass `ctx` to skip ALS lookup:

```ts
const ctx = current()
const { method } = useRequest(ctx)
const { parseBody } = useBody(ctx)
```

### `useRouteParams<T>(ctx?): { params: T; get: <K>(name: K) => T[K] }`

Return route parameters set by the router. Generic `T` defaults to `Record<string, string | string[]>`.

```ts
export function useRouteParams<
  T extends Record<string, string | string[]> = Record<string, string | string[]>,
>(ctx?: EventContext): { params: T; get: <K extends keyof T>(name: K) => T[K] }
```

```ts
// Given route /users/:id
const { params, get } = useRouteParams<{ id: string }>()
get('id') // typed as string
```

### `useEventId(ctx?): { getId: () => string }`

Lazy UUID per event. Generated on first `getId()` call, cached for event lifetime.

```ts
const { getId } = useEventId()
getId() // 'a1b2c3d4-...' (stable for this event)
```

### `useLogger` (4 overloads)

Return the logger from the current event context. When called with a `topic` string, creates a child logger via `logger.createTopic()` (falls back to base logger when `createTopic` unavailable).

```ts
export function useLogger(): Logger
export function useLogger(topic: string): Logger
export function useLogger(ctx: EventContext): Logger
export function useLogger(topic: string, ctx: EventContext): Logger
```

```ts
const log = useLogger()
log.info('handling request')

const scoped = useLogger('auth')
scoped.warn('token expired')

const explicit = useLogger('db', ctx)
```

---

## Composable Patterns

### 1. Lazy Properties

Wrap non-trivial computations in thunks so they only run when accessed:

```ts
const useRequest = defineWook((ctx) => ({
  method: ctx.get(http.keys.method),   // cheap -- direct key lookup
  query: () => ctx.get(parsedQuery),   // deferred until called
  cookies: () => ctx.get(parsedCookies), // deferred until called
}))

// Only method computed eagerly:
const { method } = useRequest()
// query computed only if accessed:
const q = useRequest().query()
```

### 2. Async Cached Values

Combine `defineWook` with `cached` for async computations:

```ts
const parsedBody = cached(async (ctx) => {
  const buf = await ctx.get(rawBody)
  return JSON.parse(buf.toString())
})

const useBody = defineWook((ctx) => ({
  parseBody: () => ctx.get(parsedBody),
}))

// In handler:
const { parseBody } = useBody()
const body = await parseBody()   // parses once
const again = await parseBody()  // cache hit, same object
```

### 3. Class-Based Composable

When a composable exposes many methods, use a class to avoid per-event closure allocation:

```ts
class ResponseState {
  status = 200
  body: unknown = undefined
  readonly headers = new Map<string, string>()

  setHeader(name: string, value: string) {
    this.headers.set(name, value)
    return this
  }
  setStatus(code: number) { this.status = code; return this }
  json(data: unknown) { this.body = data; return this }
}

const useResponse = defineWook(() => new ResponseState())
```

Methods live on the prototype -- zero closures per event.

### 4. Composable Dependencies

Composables can call other composables inside their factory. Pass `ctx` to avoid redundant ALS lookups:

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

### 5. Plain Function for Single-Value Access

`defineWook` adds caching overhead. For trivial single-value access, use a plain function:

```ts
// Overkill -- caching overhead > value cost
const useMethod = defineWook((ctx) => ctx.get(http.keys.method))

// Better -- one Map.get, no caching layer
function useMethod(ctx?: EventContext): string {
  return (ctx ?? current()).get(http.keys.method) ?? 'GET'
}
```

Use `defineWook` when factory returns an object with multiple properties/methods. Use plain functions for trivial single-value access.

---

## EventContext

Per-event container backed by `Map<number, unknown>`. Propagated via `AsyncLocalStorage`.

### Constructor

```ts
interface EventContextOptions {
  logger: Logger
  parent?: EventContext
}

const ctx = new EventContext({ logger })
const child = new EventContext({ logger, parent: ctx })
```

Every context requires a `Logger`. Access via `ctx.logger`.

### Methods (with parent chain traversal)

#### `ctx.get<T>(accessor: Key<T> | Cached<T>): T`

Read a value. Traverses parent chain: checks local first, then parent, grandparent, etc.

- For `Key<T>`: returns first value found in chain. Throws `Key "name" is not set` if not found anywhere.
- For `Cached<T>`: if computed value found anywhere in chain, returns it (no re-computation). If not found, computes and caches **locally**.

#### `ctx.set<T>(key: Key<T> | Cached<T>, value: T): void`

Write a value. Traverses parent chain: writes to first context in chain where key exists. If key is new, writes locally.

#### `ctx.has(accessor: Accessor<any>): boolean`

Check if slot is set/computed. Traverses parent chain. Returns `false` for unset keys and uncomputed cached values.

### Methods (local only -- no traversal)

#### `ctx.getOwn<T>(accessor: Key<T> | Cached<T>): T`

Like `get()` but local only. Returns value from this context only. If `Cached<T>` not found locally, computes and caches locally.

#### `ctx.setOwn<T>(key: Key<T> | Cached<T>, value: T): void`

Always writes to this context, even if key exists in parent.

#### `ctx.hasOwn(accessor: Accessor<any>): boolean`

Returns `true` only if slot set in this context.

### `ctx.seed(kind, seeds[, fn])`

Populate context from an `EventKind` schema. Also sets `eventTypeKey` to the kind's name.

```ts
ctx.seed(httpKind, { method: 'GET', path: '/api' })
ctx.get(httpKind.keys.method) // 'GET'
```

Overloaded with optional callback:

```ts
ctx.seed(http, seeds, () => {
  // seeds are available here
})
```

### `_shouldTraverseParent(id: number): boolean` (protected)

Override in subclasses to isolate specific slots -- returning `false` forces local computation/storage, preventing inheritance. Default: `true`.

### Parent Chain Behavior

- `get()` on `Cached<T>` found in parent returns parent's cached value without re-computing
- `set()` writes to first context in chain where key exists -- use `setOwn()` to shadow a parent value
- Traversal has O(depth) cost per lookup -- keep chains shallow

---

## Runtime

### `run<R>(ctx: EventContext, fn: () => R): R`

Execute `fn` within ALS scope of `ctx`. Returns fn's return value. Works with async functions.

```ts
run(ctx, () => {
  // current() returns ctx here
  return 'hello'
})
```

Supports nesting -- inner `run` creates child scope, outer scope restored after:

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

Get active context. Throws `[Wooks] No active event context` if called outside `run` scope.

### `tryGetCurrent(): EventContext | undefined`

Like `current()` but returns `undefined` instead of throwing. Use in library code that may run outside event scope.

### `createEventContext`

Convenience: create context, optionally seed a kind, run `fn` inside ALS.

```ts
// Overload 1: bare context
export function createEventContext<R>(options: EventContextOptions, fn: () => R): R

// Overload 2: with kind + seeds
export function createEventContext<S extends Record<string, any>, R>(
  options: EventContextOptions,
  kind: EventKind<S>,
  seeds: EventKindSeeds<EventKind<S>>,
  fn: () => R,
): R
```

```ts
createEventContext({ logger }, httpKind, { method: 'GET', path: '/' }, () => {
  current().get(httpKind.keys.method) // 'GET'
})
```

When a `ContextInjector` is installed and a kind is provided, the callback is automatically wrapped via `ci.with('Event:start', { eventType: kind.name }, fn)`.

### Version Safety

Uses global `Symbol.for('wooks.core.asyncStorage')` for singleton ALS. Throws at import if incompatible versions detected:

```
[wooks] Incompatible versions of @wooksjs/event-core detected: existing v0.6.6, loading v0.7.0
```

---

## Custom adapters (advanced)

Only needed to build a new adapter. Skip when consuming an existing one (HTTP/CLI/WS/WF).

```ts
const myKind = defineEventKind('my-event', { data: slot<unknown>() })

export function createMyEventContext<R>(
  options: EventContextOptions,
  seeds: EventKindSeeds<typeof myKind>,
  fn: () => R,
): R {
  return createEventContext(options, myKind, seeds, fn)
}
```

Built-ins: `createHttpContext`, `createCliContext`, `createWsConnectionContext`, `createWsMessageContext`, `createWfContext`, `resumeWfContext`.

Layer contexts with parent links (child seeds new kind, inherits parent slots):

```ts
createEventContext({ logger, parent: parentCtx }, workflowKind, seeds, fn)
```

### Routing half — extend `WooksAdapterBase`

The context factory covers slots only. To route events, extend `WooksAdapterBase` from the `wooks` package:

```ts
import { WooksAdapterBase, Wooks } from 'wooks'
import type { TWooksHandler } from 'wooks'
import type { TConsoleBase } from '@prostojs/logger'

export class WooksMy extends WooksAdapterBase {
  constructor(opts?: { logger?: TConsoleBase }, wooks?: Wooks | WooksAdapterBase) {
    super(wooks, opts?.logger) // no wooks arg -> shared global instance (getGlobalWooks)
  }

  // Register routes under your own "method" via this.on(method, path, handler)
  my<T>(path: string, handler: TWooksHandler<T>) {
    return this.on<T>('MY_EVENT', path, handler)
  }

  // Dispatch: create the context, resolve handlers, run them inside it
  trigger(path: string, data: unknown) {
    return createMyEventContext(this.getEventContextOptions(), { data }, async () => {
      const handlers = this.getWooks().lookupHandlers('MY_EVENT', path) // sets routeParamsKey
      if (!handlers) throw new Error(`No handler for ${path}`)
      for (const handler of handlers) return await handler()
    })
  }
}
```

- Pass an existing `Wooks` or adapter to the constructor to share its router; omit it to use the global singleton (`getGlobalWooks` creates on first call, `clearGlobalWooks` resets it — both exported from `wooks`).
- `lookupHandlers` writes route params into the active context, so `useRouteParams()` works in handlers. See [router.md](router.md#programmatic-api-wooks-package) for the full `Wooks` API.

---

## ContextInjector

Hook point for observability (OpenTelemetry, etc.). No injector installed by default -- `getContextInjector()` returns `null`, zero overhead.

### Class

```ts
class ContextInjector<N> {
  with<T>(name: N, attributes: Record<string, string | number | boolean>, cb: () => T): T
  with<T>(name: N, cb: () => T): T
  hook(method: string, name: 'Handler:not_found' | 'Handler:routed', route?: string): void
}
```

Default `with()` is a pass-through (just calls `cb()`). Default `hook()` is a no-op.

### Management Functions

```ts
getContextInjector<N = TContextInjectorHooks>(): ContextInjector<N> | null
replaceContextInjector(newCi: ContextInjector<string>): void
resetContextInjector(): void
```

### Example: OpenTelemetry Integration

```ts
class OtelInjector extends ContextInjector<string> {
  with<T>(name: string, attributes: Record<string, any>, cb: () => T): T {
    return tracer.startActiveSpan(name, { attributes }, () => cb())
  }
}

replaceContextInjector(new OtelInjector())

// To disable:
resetContextInjector()
```

The injector's `with()` wraps `createEventContext` callbacks. All adapters route through `createEventContext`, so installing an injector automatically instruments every event type.

Adapter callbacks return their result (sync or Promise), so `with()` can track async handler completion. A `TracingInjector` can detect thenable returns and attach `.then()/.catch()` to end spans.

### Built-in Hook Names

```ts
type TContextInjectorHooks = 'Event:start'
```

---

## Key Imports

```ts
import {
  key, cached, cachedBy, slot, defineEventKind, defineWook,
  EventContext, run, current, tryGetCurrent, createEventContext,
  useRouteParams, useEventId, useLogger,
  routeParamsKey, eventTypeKey,
  ContextInjector, getContextInjector, replaceContextInjector, resetContextInjector,
} from '@wooksjs/event-core'

import type {
  Logger, Key, Cached, Accessor, SlotMarker,
  EventKind, EventKindSeeds, EventContextOptions, WookComposable,
} from '@wooksjs/event-core'
```

Type purposes:

- `Logger` — `info`/`warn`/`error`/`debug` + optional `createTopic(name)`; compatible with `@prostojs/logger`.
- `Key<T>` / `Cached<T>` — slot descriptors returned by `key()` / `cached()`; `Accessor<T>` is either.
- `SlotMarker<T>` — phantom marker returned by `slot<T>()` for `defineEventKind` schemas.
- `EventKind<S>` — kind descriptor (`name`, `keys`); `EventKindSeeds<K>` — seed object accepted by `ctx.seed()` / `createEventContext()`.
- `EventContextOptions` — `{ logger, parent? }` for the constructor and `createEventContext`.
- `WookComposable<T>` — `(ctx?) => T` with `_slot: Cached<T>`; returned by `defineWook`.

### Standard Keys

```ts
import { routeParamsKey, eventTypeKey } from '@wooksjs/event-core'

routeParamsKey  // Key for route params (set by router)
eventTypeKey    // Key for event type name (set by ctx.seed())
```

---

## Rules & Gotchas

| #  | Invariant                                                                                                                                                       |
| -- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1  | Define `key`/`cached`/`cachedBy` at **module level** — they are descriptors, not values.                                                                           |
| 2  | Pick the right primitive: `defineWook` → object with multiple properties/methods; plain function → single-value access (no cache overhead); `cached` → expensive per-event computation (single compute, error-cached, circular-detected); `cachedBy` → computation varies by parameter (keys compared by `===`). |
| 3  | `cached` / `defineWook` factories receive `ctx` — use it, don't call `current()` inside.                                                                           |
| 4  | Factory runs once per context — put per-call logic in thunks, not in the factory body.                                                                             |
| 5  | Pass `ctx` explicitly when calling multiple composables in one handler — saves ALS lookups.                                                                        |
| 6  | `ctx.get(key)` before `set()` throws `Key "name" is not set` — use `ctx.has(k)` first.                                                                             |
| 7  | Outside `run()` scope, `current()` throws `[Wooks] No active event context` — use `tryGetCurrent()` in library code.                                               |
| 8  | `cached` errors are cached too — a failing computation never retries in the same context.                                                                          |
| 9  | `get`/`set`/`has` traverse the parent chain; `getOwn`/`setOwn`/`hasOwn` are local-only.                                                                            |
| 10 | `set()` writes to the first context in the chain that has the key — use `setOwn()` to shadow a parent value.                                                       |
| 11 | `get()` on a `Cached<T>` cached in a parent reuses the parent's value — use `getOwn()` to force local recompute.                                                   |
| 12 | Prefer parent-linked child contexts over seeding multiple kinds into one context. Traversal is O(depth) — keep chains shallow.                                     |
| 13 | `AsyncLocalStorage` propagates through `await`, timers, Promise chains — but `EventContext` is single-event, single-async-chain, not thread-safe.                  |
| 14 | Global singleton ALS via `Symbol.for('wooks.core.asyncStorage')` — incompatible versions throw at import.                                                          |

---

## See also

- [router.md](router.md) — route syntax/priority and the `wooks` programmatic API that populates `routeParamsKey`
- [event-http.md](event-http.md), [event-cli.md](event-cli.md), [event-ws.md](event-ws.md), [event-wf.md](event-wf.md) — adapters built on these primitives
