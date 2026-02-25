# Comparison with Other Frameworks

A concrete look at how Wooks differs from Express, Fastify, and h3. Wooks and h3 share similar philosophy — on-demand parsing, return-value responses. The core difference is the path each took: h3 threads an `event` object; Wooks uses `AsyncLocalStorage` and provides context primitives that make lazy computation with caching the default by design.

## Request Lifecycle

**Express / Fastify:** Middleware runs before your handler. Body parsing, cookie parsing, auth checks — they execute on every request that matches their mount path, whether the handler needs the result or not. By the time your route function runs, work has already been done.

**h3:** Philosophically close to Wooks — on-demand parsing, return values as responses. `readBody(event)` reads the stream when you call it, not before. The difference is in the wiring: h3 threads an `event` object through every call. (h3 v2 added a `next()`-based middleware system, but the on-demand philosophy remains.)

**Wooks:** Same on-demand philosophy, different mechanism. Context lives in `AsyncLocalStorage` — composables need no arguments. And the context primitives (`cached`, `cachedBy`, `defineWook`) make lazy-with-caching the default: `useBody().parseBody()` parses once, caches for the event lifetime, returns the cached result on repeat calls — all by design, not by manual memoization.

```ts
// Express: body is already parsed by the time you get here
app.post('/users', (req, res) => {
  if (!req.headers.authorization) return res.status(401).end()
  // req.body was parsed anyway
})

// Wooks: nothing happens until you ask
app.post('/users', () => {
  const { authorization } = useHeaders()
  if (!authorization) throw new HttpError(401)
  // body is never touched
  const { parseBody } = useBody()
  return parseBody() // parsed only now
})
```

## Routing

All four frameworks support parametric routes. The differences are in edge cases and performance.

**Express:** Linear scan — checks routes in registration order. No indexing, no caching. Slows down with large route tables.

**Fastify (find-my-way):** Radix-tree based. Fast for static routes, handles parameters well. Some quirks with URI encoding/decoding in edge cases.

**h3 (rou3, formerly radix3):** Fast for static lookups. Weaker on complex dynamic patterns — regex constraints and multi-segment wildcards are not supported.

**Wooks ([@prostojs/router](https://github.com/prostojs/router)):** Categorizes routes into statics, parameters, and wildcards with indexing and caching. Supports features the others don't:

- Multiple wildcards in one path: `/static/*/assets/*`
- Regex constraints on parameters: `/api/time/:hours(\\d{2})h:minutes(\\d{2})m`
- Regex constraints on wildcards: `/static/*(\\d+)`
- On-the-fly generated parsers — parameter extraction in a single function call

### Router Benchmark

Operations per millisecond ([source](https://github.com/prostojs/router-benchmark)):

| Test | Express | find-my-way | @prostojs/router | radix3 |
|:-----|--------:|------------:|-----------------:|-------:|
| Short static | 1 792 | 7 070 | 6 912 | 10 326 |
| Static with same radix | 1 388 | 4 662 | 8 537 | 14 058 |
| Dynamic route | 739 | 1 768 | 1 888 | 959 |
| Mixed static dynamic | 685 | 3 101 | 3 470 | 988 |
| Long static | 637 | 2 174 | 8 934 | 14 000 |
| Wildcard | 486 | 2 081 | 2 065 | 1 019 |
| **All together** | **663** | **2 328** | **2 893** | **1 549** |

`@prostojs/router` leads on mixed and dynamic patterns — the cases that matter most in real APIs. radix3 (now rou3) wins on pure static lookups.

## Context Passing

**Express / Fastify:** Attach data to `req`. Custom properties (`req.user`, `req.parsedBody`) have no type definitions unless you extend the interface. Every function that needs context receives `(req, res)`.

**h3:** Replaces `req`/`res` with a single `event` object — cleaner, but still threaded explicitly: `readBody(event)`, `getQuery(event)`, `getCookie(event)`. Every utility takes `event` as its first argument, which means every helper function you extract must accept and forward it.

**Wooks:** `AsyncLocalStorage` eliminates the threading entirely. Composables take no arguments — they resolve context from the current async scope:

```ts
// h3
export default defineEventHandler((event) => {
  const body = await readBody(event)
  const query = getQuery(event)
  const cookie = getCookie(event, 'session')
})

// Wooks
app.post('/endpoint', async () => {
  const body = await useBody().parseBody()
  const query = useSearchParams()
  const cookie = useCookies().getCookie('session')
})
```

No `event` threading. Composables work at any depth in the call stack — inside utility functions, inside library code, inside `async` helpers — without passing anything.

## Response Control

**Express:** `res.status(200).json(data)` — imperative calls on the response object, which you must receive as a parameter.

**Fastify:** `reply.code(200).send(data)` — similar pattern, similar coupling.

**h3:** Return values become the response — same idea as Wooks. `setResponseStatus(event, 200)` for explicit control. Still requires `event` threading.

**Wooks:** Return values become the response too. For explicit control, `useResponse()` returns an `HttpResponse` with chainable methods — no arguments needed:

```ts
app.get('/data', () => {
  useResponse()
    .setStatus(200)
    .setHeader('x-custom', 'value')
    .setCookie('session', 'abc', { httpOnly: true })
    .setCacheControl({ public: true, maxAge: 3600 })

  return { data: 'hello' }
})
```

All methods live on one object. No separate `useSetHeaders()`, `useSetCookies()`, `useSetCacheControl()` — just `useResponse()`.

## Summary

| | Express | Fastify | h3 | Wooks |
|---|---------|---------|-----|-------|
| Body parsing | Middleware (eager) | Built-in (eager) | `readBody(event)` (on demand) | `useBody().parseBody()` (on demand, cached) |
| Context passing | `req` / `res` params | `request` / `reply` params | `event` param | Implicit (AsyncLocalStorage) |
| Routing | Linear scan | Radix tree | Radix tree | Indexed + cached, regex params, multi-wildcard |
| Response API | `res.status().json()` | `reply.code().send()` | Return value + `setResponseStatus(event)` | Return value + `useResponse()` chainable |
| TypeScript | Bolted on | Schema-driven | Good | Native, composable-level inference |
| Beyond HTTP | No | No | WebSocket (crossws), SSE | CLI, Workflows, custom events |
