# Composables — @wooksjs/event-core

> `defineWook` and the built-in composables: `useRouteParams`, `useEventId`, `useLogger`.

## Concepts

A **composable** is a function that accesses per-event contextual data. Call it — get typed data back. No arguments needed (context resolved via `AsyncLocalStorage`).

`defineWook(factory)` is the primitive that creates composables. The factory runs once per `EventContext`, and the result is cached. Every subsequent call within the same event returns the same object.

All built-in composables across the Wooks ecosystem (`useRequest`, `useResponse`, `useBody`, `useCookies`, etc.) are built with `defineWook`.

## API Reference

### `defineWook<T>(factory: (ctx: EventContext) => T): (ctx?: EventContext) => T`

Creates a composable with per-event caching. Internally wraps the factory in a `cached()` slot.

```ts
import { defineWook, defineEventKind, slot } from '@wooksjs/event-core'

const http = defineEventKind('http', {
  method: slot<string>(),
  path: slot<string>(),
})

const useRequest = defineWook((ctx) => ({
  method: ctx.get(http.keys.method),
  path: ctx.get(http.keys.path),
}))

// In a handler:
const { method, path } = useRequest()
```

**Caching guarantee:** The factory runs exactly once per event context. Subsequent calls return the same object:

```ts
const a = useRequest()
const b = useRequest()
a === b // true — same object reference
```

**Optional explicit context:** Pass `ctx` to skip the `AsyncLocalStorage` lookup:

```ts
const ctx = current()
const { method } = useRequest(ctx)
const { parseBody } = useBody(ctx)
```

### `useRouteParams<T>(ctx?): { params: T; get: (name) => T[K] }`

Returns route parameters set by the router. Generic `T` defaults to `Record<string, string | string[]>`.

```ts
import { useRouteParams } from '@wooksjs/event-core'

// Given route /users/:id
const { params, get } = useRouteParams<{ id: string }>()
params.id   // 'abc'
get('id')   // 'abc'
```

### `useEventId(ctx?): { getId: () => string }`

Returns a lazy UUID for the current event. The UUID is generated on first call to `getId()` and cached.

```ts
import { useEventId } from '@wooksjs/event-core'

const { getId } = useEventId()
getId() // 'a1b2c3d4-...' (stable for this event)
```

### `useLogger(ctx?): Logger`

Returns the logger from the current event context. Shorthand for `(ctx ?? current()).logger`.

```ts
import { useLogger } from '@wooksjs/event-core'

const log = useLogger()
log.info('handling request')
```

## Common Patterns

### Pattern: Composable with lazy properties

Wrap non-trivial computations in thunks so they only run when accessed:

```ts
const useRequest = defineWook((ctx) => ({
  method: ctx.get(http.keys.method),          // cheap — direct key lookup
  query: () => ctx.get(parsedQuery),           // deferred until called
  cookies: () => ctx.get(parsedCookies),       // deferred until called
}))

// Only method is computed eagerly:
const { method } = useRequest()
// query is only computed if accessed:
const q = useRequest().query()
```

### Pattern: Composable with async cached values

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
const body = await parseBody()    // parses once
const again = await parseBody()   // cache hit, same object
```

### Pattern: Class-based composable for method-heavy APIs

When a composable exposes many methods, use a class to avoid per-event closure allocation:

```ts
class ResponseState {
  status = 200
  body: unknown = undefined
  readonly headers = new Map<string, string>()

  setHeader(name: string, value: string) { this.headers.set(name, value); return this }
  setStatus(code: number) { this.status = code; return this }
  json(data: unknown) { this.body = data; return this }
}

const useResponse = defineWook(() => new ResponseState())
```

Methods live on the prototype — zero closures per event.

### Pattern: Composable depending on another composable

Composables can call other composables inside their factory:

```ts
const useCurrentUser = defineWook((ctx) => {
  const { basicCredentials } = useAuthorization(ctx)
  const username = basicCredentials()?.username
  return {
    username,
    profile: async () => username ? await db.findUser(username) : null,
  }
})
```

Pass `ctx` to avoid redundant `AsyncLocalStorage` lookups.

### Pattern: Plain function for single-value access

`defineWook` adds caching overhead. For trivial single-value access, use a plain function:

```ts
// Overkill — caching overhead > value cost
const useMethod = defineWook((ctx) => ctx.get(http.keys.method))

// Better — one Map.get, no caching layer
function useMethod(ctx?: EventContext): string {
  return (ctx ?? current()).get(http.keys.method) ?? 'GET'
}
```

## Best Practices

- Use `defineWook` when the factory returns an object with multiple properties or methods
- Use plain functions for trivial single-value access
- Always accept optional `ctx` parameter in composables for performance
- Pass `ctx` explicitly when calling multiple composables in sequence
- Use thunks for non-trivial properties in the returned object
- Use classes for composables with 4+ methods

## Gotchas

- `defineWook` factory receives `ctx` as parameter — use it instead of calling `current()` inside
- The factory runs once per context — don't put per-call logic in it (use thunks for that)
- Calling a composable outside an event context throws `No active event context`
- Different event contexts get different composable instances — the cache is per-context
