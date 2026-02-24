# event-context

Typed, per-event context with lazy cached computations, composable API, and AsyncLocalStorage propagation.

## Core Primitives

### `key<T>(name)` — Typed Slot

Define a named, typed slot. Value is set explicitly via `ctx.set()`.

```ts
const userId = key<string>('userId');

ctx.set(userId, 'u-123');
ctx.get(userId); // 'u-123' (typed as string)
```

### `cached(fn)` — Lazy Computation with Caching

Define a derived value that is computed on first access and cached for the lifetime of the event.

```ts
const parsedQuery = cached((ctx) => {
  return Object.fromEntries(new URL(ctx.get(url)).searchParams);
});

ctx.get(parsedQuery); // parses once
ctx.get(parsedQuery); // returns cached result
```

Async works naturally — the Promise itself is cached, deduplicating concurrent access:

```ts
const rawBody = cached((ctx) =>
  new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    ctx.get(req).on('data', (c: Buffer) => chunks.push(c));
    ctx.get(req).on('end', () => resolve(Buffer.concat(chunks)));
    ctx.get(req).on('error', reject);
  })
);

// Two concurrent calls → one read, one Promise
const [a, b] = await Promise.all([ctx.get(rawBody), ctx.get(rawBody)]);
a === b; // true
```

Errors are cached too — a failed computation throws the same error on subsequent access without re-executing.

Circular dependencies are detected and throw immediately.

### `cachedBy(fn)` — Parameterized Cached Computation

Like `cached`, but keyed by a parameter. Each unique key computes once per event.

```ts
const useCookie = cachedBy((name: string, ctx) => {
  const header = ctx.get(headersMap)['cookie'] ?? '';
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match?.[1];
});

useCookie('session');  // extracts + caches
useCookie('session');  // cache hit
useCookie('theme');    // extracts + caches (different key)
```

### `defineEventKind(name, schema)` — Typed Seed Bundle

Group seed values into a named kind. Used to bootstrap a context with domain-specific data.

```ts
const httpKind = defineEventKind('http', {
  req: slot<IncomingMessage>(),
  res: slot<ServerResponse>(),
  routeParams: slot<Record<string, string>>(),
});
```

Attach to a context:

```ts
ctx.attach(httpKind, { req, res, routeParams: { id: '42' } }); // fully typed
```

Multiple kinds can coexist on the same context:

```ts
ctx.attach(httpKind, { req, res, routeParams });
ctx.attach(workflowKind, { triggerId, payload });
// both accessible, flat slot storage
```

### `defineWook(factory)` — Cached Composable

Define a composable function that computes once per event context and returns the cached result on subsequent calls.

```ts
const useRequest = defineWook((ctx) => ({
  method: ctx.get(httpKind.keys.req).method ?? 'GET',
  path:   () => ctx.get(parsedUrl).pathname,
  query:  () => ctx.get(parsedQuery),
}));

// In handler:
const { method, query } = useRequest();
```

Accepts an optional `ctx` parameter to skip the AsyncLocalStorage lookup:

```ts
const ctx = current();
const { method } = useRequest(ctx);
const { parseBody } = useBody(ctx);
```

### `createEventContext(options, kind, seeds, fn)` — Event Lifecycle

Create a context, attach seeds, and run within an AsyncLocalStorage scope:

```ts
createHttpEvent({ req, res, routeParams, logger }, async () => {
  const { method } = useRequest();
  const log = useLogger();
  // ...
});
```

### `run(ctx, fn)` / `current()` / `useLogger()`

Low-level async propagation. `current()` retrieves the active context. `useLogger()` is shorthand for `current().logger`.

## EventContext Base Properties

Every context carries a `logger` — always present, not a slot:

```ts
const ctx = new EventContext({ logger });
ctx.logger.info('always available');
```

## Extension Pattern

Libraries export `cached` slots for other libraries to depend on, and `defineWook` composables for end users:

```ts
// http-context (library)
export const rawBody = cached((ctx) => readStream(ctx.get(httpKind.keys.req)));
export const useRequest = defineWook((ctx) => ({ ... }));

// body-parser (extension library)
import { rawBody } from 'http-context';

const parsedBody = cached(async (ctx) => {
  const buf = await ctx.get(rawBody); // depends on http-context's cached slot
  return JSON.parse(buf.toString());
});

export const useBody = defineWook((ctx) => ({
  parseBody: () => ctx.get(parsedBody),
}));
```

## Performance Guide

### 1. Pass `ctx` when calling multiple composables

Each `useX()` call without arguments hits `AsyncLocalStorage.getStore()`. For hot paths with multiple composables, resolve once and reuse:

```ts
// ❌ 4 ALS lookups
const { method } = useRequest();
const { parseBody } = useBody();
const session = useCookie('session');
const log = useLogger();

// ✅ 1 ALS lookup
const ctx = current();
const { method } = useRequest(ctx);
const { parseBody } = useBody(ctx);
const session = useCookie('session', ctx);
const log = ctx.logger;
```

### 2. Use thunks for non-trivial values in wooks

Everything in a wook factory runs eagerly on first access. Wrap anything beyond a key lookup in a thunk:

```ts
// ❌ URL parsing + query parsing happen even if unused
const useRequest = defineWook((ctx) => ({
  method: ctx.get(httpKind.keys.req).method,
  query:  ctx.get(parsedQuery),         // runs now
  url:    ctx.get(parsedUrl),           // runs now
}));

// ✅ Only method is resolved eagerly (O(1) key lookup)
const useRequest = defineWook((ctx) => ({
  method: ctx.get(httpKind.keys.req).method,
  query:  () => ctx.get(parsedQuery),   // deferred
  url:    () => ctx.get(parsedUrl),     // deferred
}));
```

### 3. Use classes for method-heavy wooks

Object literals with many function properties allocate one closure per property per event. Classes put methods on the prototype — zero closures:

```ts
// ❌ 6 closures allocated per event
const useResponse = defineWook((ctx) => ({
  status: (code: number) => { ... },
  setHeader: (name: string, value: string) => { ... },
  setCookie: (name: string, value: string) => { ... },
  json: (data: unknown) => { ... },
  text: (body: string) => { ... },
  redirect: (url: string) => { ... },
}));

// ✅ 0 closures — methods on prototype
class ResponseState {
  status = 200;
  body: unknown = undefined;
  readonly headers = new Map<string, string>();

  setHeader(name: string, value: string) { this.headers.set(name, value); return this; }
  json(data: unknown) { this.body = data; return this; }
  // ...
}

const useResponse = defineWook(() => new ResponseState());
```

### 4. Use plain functions for trivial single-value access

A `defineWook` for a single value adds caching overhead (Map.has + Map.get) that exceeds the cost of the value itself. Use a plain function:

```ts
// ❌ Overkill — caching overhead > value lookup
const useMethod = defineWook((ctx) => ctx.get(httpKind.keys.req).method);

// ✅ Direct — one Map.get, no caching layer
function useMethod(ctx?: EventContext): string {
  return (ctx ?? current()).get(httpKind.keys.req).method ?? 'GET';
}
```

### 5. Prefer `cachedBy` over parse-all for sparse access

When the data source is large but your app reads few entries, extract per-key instead of parsing everything:

```ts
// ❌ Parses all 40 cookies, app uses 1
const cookieMap = cached((ctx) => parseCookies(ctx.get(cookieHeader)));

// ✅ Extracts only what's requested, cached per name
const useCookie = cachedBy((name: string, ctx) => {
  const header = ctx.get(headersMap)['cookie'] ?? '';
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match?.[1];
});
```

### Summary

| Scenario | Tool | Allocations |
|---|---|---|
| Single value access | plain function `(ctx?) => T` | 0 |
| Group of related lazy values | `defineWook` + thunks | 1 object |
| Method-heavy tools (response) | `defineWook` + class | 1 instance, 0 closures |
| Expensive shared computation | `cached` | computed once |
| Expensive per-key computation | `cachedBy` | computed once per key |
| Multiple composables in one call site | `current()` + pass `ctx` | 1 ALS lookup |

## AI Agent Skills

`@wooksjs/event-core` ships an AI agent skill for Claude Code, Cursor, Windsurf, Codex, and other compatible agents. The skill teaches your agent the library's APIs, patterns, and best practices so it can help you write correct code without hallucinating.

**Install the skill into your agent:**

```bash
# Project-local (recommended — version-locked, commits with your repo)
npx @wooksjs/event-core setup-skills

# Global (available across all your projects)
npx @wooksjs/event-core setup-skills --global
```

Restart your agent after installing.

**Auto-update on install** — to keep the skill in sync whenever you upgrade the package, add this to your project's `package.json`:

```jsonc
{
  "scripts": {
    "postinstall": "npx @wooksjs/event-core setup-skills --postinstall"
  }
}
```
