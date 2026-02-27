<script setup>
// Source data URLs (for future updates):
//   https://raw.githubusercontent.com/prostojs/router-benchmark/refs/heads/main/packages/wooks-benchmark/results/results.json
//   https://raw.githubusercontent.com/prostojs/router-benchmark/refs/heads/main/packages/wooks-benchmark/results/results-db.json

// ── HTTP framework benchmark data ──────────────────────────────────

const httpSummary = {
  'Wooks': 70332,
  'Fastify': 68273,
  'h3': 64860,
  'Hono': 59466,
  'Express': 47147,
}

const httpPublic = {
  'Short static': {
    'Wooks': 89504,
    'Fastify': 87520,
    'h3': 81184,
    'Hono': 85472,
    'Express': 58512,
  },
  'Login (set-cookie)': {
    'Wooks': 45488,
    'Fastify': 53488,
    'h3': 67296,
    'Hono': 35504,
    'Express': 43504,
  },
  'Wildcard + cache': {
    'Wooks': 80480,
    'Fastify': 85472,
    'h3': 76384,
    'Hono': 75488,
    'Express': 56496,
  },
  'Wildcard deep': {
    'Wooks': 84512,
    'Fastify': 85984,
    'h3': 75808,
    'Hono': 76000,
    'Express': 58000,
  },
}

const httpHeaderAuth = {
  'Static': {
    'Wooks': 80480,
    'Fastify': 88480,
    'h3': 82144,
    'Hono': 77024,
    'Express': 60496,
  },
  'Param': {
    'Wooks': 78496,
    'Fastify': 85984,
    'h3': 78752,
    'Hono': 76512,
    'Express': 58992,
  },
  'Long static + cache': {
    'Wooks': 77984,
    'Fastify': 82528,
    'h3': 78304,
    'Hono': 72032,
    'Express': 58992,
  },
  'POST small body': {
    'Wooks': 50000,
    'Fastify': 55984,
    'h3': 69664,
    'Hono': 38000,
    'Express': 43984,
  },
  'FAIL (401)': {
    'Wooks': 69472,
    'Fastify': 87968,
    'h3': 78752,
    'Hono': 74016,
    'Express': 60016,
  },
}

const httpCookieAuth = {
  'Param + suffix': {
    'Wooks': 82016,
    'Fastify': 73504,
    'h3': 66144,
    'Hono': 64016,
    'Express': 49008,
  },
  'Two params': {
    'Wooks': 82528,
    'Fastify': 73504,
    'h3': 65632,
    'Hono': 63504,
    'Express': 48016,
  },
  'Four params': {
    'Wooks': 81504,
    'Fastify': 71968,
    'h3': 64752,
    'Hono': 63504,
    'Express': 46992,
  },
  'POST small body': {
    'Wooks': 46992,
    'Fastify': 47024,
    'h3': 56688,
    'Hono': 34000,
    'Express': 35504,
  },
  'PUT small body': {
    'Wooks': 46992,
    'Fastify': 46992,
    'h3': 57648,
    'Hono': 33008,
    'Express': 35984,
  },
  'POST large body': {
    'Wooks': 9612,
    'Fastify': 9300,
    'h3': 10764,
    'Hono': 10564,
    'Express': 11220,
  },
  'FAIL (401)': {
    'Wooks': 69024,
    'Fastify': 84512,
    'h3': 76320,
    'Hono': 74976,
    'Express': 57488,
  },
}

const httpErrors = {
  '404 short': {
    'Wooks': 76512,
    'Fastify': 87008,
    'h3': 50000,
    'Hono': 82016,
    'Express': 61008,
  },
  '404 deep': {
    'Wooks': 75488,
    'Fastify': 85024,
    'h3': 48496,
    'Hono': 80480,
    'Express': 62000,
  },
  'Large body + bad header-auth': {
    'Wooks': 34480,
    'Fastify': 9300,
    'h3': 39408,
    'Hono': 32472,
    'Express': 11564,
  },
  'Large body + bad cookie-auth': {
    'Wooks': 34480,
    'Fastify': 9612,
    'h3': 38480,
    'Hono': 33488,
    'Express': 11220,
  },
}

// ── With simulated Redis calls ───────────────────────────────────────

const httpWithDb = {
  'Wooks': 50854,
  'Fastify': 49879,
  'h3': 47575,
  'Hono': 45542,
  'Express': 37868,
}
</script>

# HTTP Framework Benchmark

How fast is Wooks compared to Express, Fastify, h3, and Hono? This isn't a "hello world" test — it's a production-realistic benchmark that exercises the full HTTP request lifecycle.

Full source code: [prostojs/router-benchmark](https://github.com/prostojs/router-benchmark)

## Why Not "Hello World"?

Most framework benchmarks test a single `GET /` route returning a string. That tells you almost nothing about real-world performance, where every request involves routing, header inspection, cookie parsing, auth checks, body parsing, and response serialization.

Our benchmark simulates a **project management SaaS API** with 21 routes across three authentication tiers — the kind of app you'd actually build.

## Frameworks Tested

| Framework | Router |
|---|---|
| **Wooks** | @prostojs/router |
| **Fastify** | find-my-way |
| **h3** | rou3 |
| **Hono** | RegExpRouter |
| **Express** | Express router (baseline) |

## Methodology

Benchmarks run with [autocannon](https://github.com/mcollina/autocannon) across 20 test scenarios, each in its own child process.

Every request goes through the full HTTP lifecycle — routing, header inspection, cookie parsing (a realistic ~20-cookie jar), auth guards, body parsing, and response serialization.

### Traffic Distribution

Tests are weighted to reflect what a real SaaS app actually sees:

| Traffic type | Weight |
|---|---|
| Cookie-auth reads (browser) | 42% |
| Cookie-auth writes (browser) | 18% |
| Header-auth (API clients) | 16% |
| Public / static | 10% |
| Auth failures | 5% |
| 404 responses | 5% |
| Bot / scanner traffic | 4% |

## Overall Throughput

Weighted average across all 20 test scenarios:

<ClientOnly>
  <BenchmarkBars :data="httpSummary" title="Average throughput (req/s)" />
</ClientOnly>

**Wooks comes out on top**, with Fastify close behind, then h3, Hono, and Express trailing by about 1.5x.

::: tip Key insight
While the [router benchmark](/benchmarks/router) showed massive differences between routers, the full framework benchmark compresses the gap to about **1.5x** between fastest and slowest (excluding Express). Routing is a tiny fraction of what an HTTP server does — the rest is TCP, HTTP parsing, headers, cookies, bodies, and serialization.
:::

## Public & Static Routes

Static responses, wildcard routing, login with `set-cookie`.

<ClientOnly>
  <BenchmarkChart :data="httpPublic" mode="stacked" unit="req/s" title="Public & static routes (req/s)" />
</ClientOnly>

Wooks and Fastify trade blows on static and wildcard routes, both well ahead of the pack. h3 wins the login/set-cookie scenario — its cookie serialization is notably fast. Express trails behind.

## Header-Auth API Routes

Bearer-token authenticated endpoints — typical API client traffic.

<ClientOnly>
  <BenchmarkChart :data="httpHeaderAuth" mode="stacked" unit="req/s" title="Header-auth API routes (req/s)" />
</ClientOnly>

Fastify leads on pure header-auth static routes and auth failure fast-paths. h3 excels at body parsing for small POSTs. Wooks delivers consistently strong results across the board — no weak spots.

## Cookie-Auth Browser Routes

The biggest traffic category in any SaaS app — browser requests with ~20 cookies per request.

<ClientOnly>
  <BenchmarkChart :data="httpCookieAuth" mode="stacked" unit="req/s" title="Cookie-auth browser routes (req/s)" />
</ClientOnly>

**This is where Wooks shines.** On cookie-authenticated parametric routes, Wooks leads decisively — roughly 10–15% faster than Fastify, the next closest competitor.

Why? Wooks parses cookies **lazily**. The `useCookies()` composable doesn't touch the cookie header until you actually call `getCookie()`. Combined with cached parametric parsing from `@prostojs/router`, Wooks avoids work that other frameworks do eagerly.

For large body payloads (~100KB JSON), all frameworks converge to roughly the same speed — body parsing dominates at that scale and erases framework differences.

## Error Responses & Edge Cases

404s, authentication failures with large bodies, bot traffic.

<ClientOnly>
  <BenchmarkChart :data="httpErrors" mode="stacked" unit="req/s" title="Error responses & edge cases (req/s)" />
</ClientOnly>

Two notable patterns:

**404 handling:** Fastify and Hono lead the pack. h3 struggles here — its router has higher overhead on failed lookups. Wooks handles 404s comfortably.

**Large body + auth failure:** This tests whether the framework reads the body before checking auth. Wooks and h3 skip body parsing when auth fails — **over 3x faster** than Fastify, which parses the body eagerly regardless. This is the lazy-by-default architecture paying off in a very real scenario.

## Where Wooks Wins

**Cookie-heavy browser traffic.** In the most common SaaS traffic pattern — browser requests with cookies — Wooks leads clearly. Lazy cookie parsing and cached route parameter extraction give it a structural advantage.

**Early rejection of bad requests.** When authentication fails, Wooks skips body parsing entirely. For large payloads with bad credentials, this means dramatically faster rejection than frameworks that parse eagerly.

**Consistent across all scenarios.** Wooks is competitive or leading in the vast majority of test scenarios — the most balanced profile of any framework tested.

## Where Others Shine

**Fastify** leads on pure header-auth static routes and 404 fast-paths. Its mature HTTP pipeline is highly optimized for simple request/response cycles.

**h3** excels at body parsing — both small and large payloads. Its `readBody()` implementation is the fastest in the benchmark. It also wins the login/set-cookie scenario.

**Hono** is fast on static routes and 404 handling, though its cookie-auth performance falls behind.

## The Real-World Perspective

These benchmarks measure raw framework throughput — the theoretical ceiling. In a real application, your handlers make database queries, call external APIs, and process business logic. Those operations take orders of magnitude longer than framework overhead.

When we added simulated Redis calls to this same benchmark, the gap between all frameworks shrank significantly:

<ClientOnly>
  <BenchmarkBars :data="httpWithDb" title="With simulated Redis calls — weighted average (req/s)" />
</ClientOnly>

The top four frameworks cluster tightly together. With real database queries and data processing, the differences become **negligible from a performance perspective**.

::: info The bottom line
Performance alone shouldn't drive your framework choice. All five frameworks tested here are fast enough for any production workload. Pick the one that gives you the best abstractions, developer experience, and ecosystem for your problem.
:::

## Why Wooks Is the Right Choice

Wooks doesn't just win on throughput — it wins on **what you get for that throughput**.

**Speed without sacrificing DX.** Wooks gives you top throughput *and* the cleanest API. No `(req, res)` threading, no middleware ordering puzzles. Just composable functions — `useRequest()`, `useBody()`, `useCookies()` — that work anywhere in your call stack.

**Lazy by default means fast by default.** Cookies aren't parsed until you read one. Bodies aren't deserialized until you ask. Route params aren't extracted until accessed. The benchmarks prove this architecture pays off where it matters most: real-world traffic with cookies and complex routes.

**Type-safe from the ground up.** Every composable returns typed data. No `req.user as User` casts, no runtime type assertions. TypeScript works *with* you, not against you.

**One pattern beyond HTTP.** The same composable pattern powers [CLI apps](/cliapp/), [WebSocket servers](/wsapp/), and [workflow engines](/wf/). Learn one abstraction, apply it everywhere. No other framework in this benchmark offers that.

**Built-in context management.** `AsyncLocalStorage`-backed event context with `cached()` slots, typed storage, and composable factories. Every composable you write gets per-request caching, type safety, and zero-argument access for free.

**The richest router in the benchmark.** `@prostojs/router` supports regex constraints, multiple wildcards, optional parameters, case-insensitive matching, and trailing slash normalization — features the competition simply doesn't have. And it's still the [fastest on the routes real apps use](/benchmarks/router).

---

*Benchmark source: [prostojs/router-benchmark](https://github.com/prostojs/router-benchmark). Results generated Feb 2026.*
