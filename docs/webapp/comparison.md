# Comparison with Other HTTP Frameworks

A concrete look at how Wooks HTTP differs from Express, Fastify, and h3. Wooks and h3 share similar philosophy — on-demand parsing, return-value responses. The core difference is the path each took: h3 threads an `event` object; Wooks uses `AsyncLocalStorage` and provides context primitives that make lazy computation with caching the default by design.

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

**h3 (rou3):** Fast for static lookups. Weaker on complex dynamic patterns — regex constraints on parameters and wildcards are not supported.

**Wooks ([@prostojs/router](https://github.com/prostojs/router)):** Categorizes routes into statics, parameters, and wildcards with indexing and caching. Notable capabilities:

- Multiple wildcards in one path: `/static/*/assets/*`
- Regex constraints on parameters: `/api/time/:hours(\\d{2})h:minutes(\\d{2})m`
- Regex constraints on wildcards: `/static/*(\\d+)`
- On-the-fly generated parsers — parameter extraction in a single function call

### Router Performance

In a [pure router benchmark](https://github.com/prostojs/router-benchmark) at 22 routes (ops/ms, higher is better):

| Route type | @prostojs/router | rou3 (compiled) | rou3 | Hono RegExpRouter | find-my-way | Express |
|---|---:|---:|---:|---:|---:|---:|
| Short routes | 43,488 | **135,452** | 56,277 | 56,638 | 34,096 | 2,438 |
| Long routes | 9,604 | **39,335** | 6,537 | 8,906 | 11,090 | 1,144 |
| Mixed routes | 29,171 | **56,940** | 30,704 | 53,412 | 28,068 | 2,177 |

rou3's compiled mode (`compileRouter()`) is the fastest on every route shape. `@prostojs/router` is mid-pack: ahead of find-my-way on short routes, behind it on long (deep, parametric) routes, and level with rou3 and find-my-way on mixed routes. As route tables grow to 200 routes, find-my-way and compiled rou3 lose the least throughput, and Hono's router loses the most — see the [scaling results](/benchmarks/router#scaling).

### HTTP Framework Throughput

In a [full HTTP lifecycle benchmark](https://github.com/prostojs/router-benchmark) with 22 routes, authentication, cookies, and body parsing (traffic-mix req/s = weighted harmonic mean over 20 tests; indicative estimate, single round on a laptop):

| Framework | Traffic-mix req/s | Relative |
|---|---:|---|
| **Fastify** | **115,880** | **fastest** |
| Wooks | 107,749 | 1.08x slower |
| Hono | 98,364 | 1.18x slower |
| h3 | 86,165 | 1.34x slower |
| Express | 63,060 | 1.84x slower |

Wooks has the highest throughput on cookie-authenticated GET routes (the largest share of browser traffic), 9–14% ahead of Fastify, helped by lazy cookie parsing. Fastify is ahead on most other tests. Wooks is the slowest of the five on a large (~25 KB) JSON body, and behind Fastify on auth failures, 404s and login. Every framework in the benchmark checks auth before parsing the body, so none of them parses the body of an unauthorized request.

See the full benchmark analysis with charts: [Router benchmarks](/benchmarks/router) and [HTTP framework benchmarks](/benchmarks/wooks-http).

## Context Passing

**Express / Fastify:** Attach data to `req`. Custom properties (`req.user`, `req.parsedBody`) have no type definitions unless you extend the interface. Every function that needs context receives `(req, res)`.

**h3:** Replaces `req`/`res` with a single `event` object — cleaner, but still threaded explicitly: `readBody(event)`, `getQuery(event)`, `getCookie(event)`. Every utility takes `event` as its first argument, which means every helper function you extract must accept and forward it.

**Wooks:** `AsyncLocalStorage` eliminates the threading entirely. Composables take no arguments — they resolve context from the current async scope:

```ts
// h3
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const query = getQuery(event)
  const cookie = getCookie(event, 'session')
})

// Wooks
app.post('/endpoint', async () => {
  const body = await useBody().parseBody()
  const query = useUrlParams()
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

All response methods live on one chainable object — `useResponse()` is the single entry point for status, headers, cookies, and cache control.

## Summary

| | Express | Fastify | h3 | Wooks |
|---|---------|---------|-----|-------|
| Body parsing | Middleware (eager) | Built-in (eager) | `readBody(event)` (on demand) | `useBody().parseBody()` (on demand, cached) |
| Context passing | `req` / `res` params | `request` / `reply` params | `event` param | Implicit (AsyncLocalStorage) |
| Routing | Linear scan | Radix tree | Radix tree | Indexed + cached, regex params, multi-wildcard |
| Response API | `res.status().json()` | `reply.code().send()` | Return value + `setResponseStatus(event)` | Return value + `useResponse()` chainable |
| TypeScript | Bolted on | Schema-driven | Good | Native, composable-level inference |
| Beyond HTTP | No | No | WebSocket (crossws), SSE | CLI, WebSocket, Workflows, custom events |
