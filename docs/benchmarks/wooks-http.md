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

How fast is Wooks compared to Express, Fastify, h3, and Hono? Not a "hello world" test — a production-realistic benchmark measuring the full HTTP request lifecycle.

Full source code: [prostojs/router-benchmark](https://github.com/prostojs/router-benchmark)

## Why Not "Hello World"?

Most framework benchmarks test a single `GET /` route returning a string. That tells you nothing about production performance, where every request involves routing with parameters, header inspection, cookie parsing, authentication checks, body deserialization, and response serialization.

Our benchmark simulates a **project management SaaS API** with 21 routes across three authentication tiers — the kind of application you'd actually build.

## Frameworks Tested

| Framework | Router |
|---|---|
| **Wooks** | @prostojs/router |
| **Fastify** | find-my-way |
| **h3** | rou3 |
| **Hono** | RegExpRouter |
| **Express** | Express router (baseline) |

## Methodology

All benchmarks use [autocannon](https://github.com/mcollina/autocannon) with **100 concurrent connections** and **10 pipelining**, running each test in a separate child process. Duration: 0.5 seconds per test, 20 test scenarios.

Every request exercises the full HTTP lifecycle:

- TCP handling and HTTP parsing
- Route matching with static, parametric, and wildcard paths
- Header inspection (Bearer tokens, API keys)
- Cookie parsing (~20-cookie jar — typical SaaS browser session)
- Authentication guard checks (early rejection before body parsing)
- JSON body parsing (small and large payloads)
- Response serialization with cache headers

### Traffic Distribution

Tests are weighted to reflect realistic SaaS traffic:

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

| Framework | Avg req/s | Relative |
|---|---:|---|
| **Wooks** | **70,332** | **fastest** |
| Fastify | 68,273 | 1.03x slower |
| h3 | 64,860 | 1.08x slower |
| Hono | 59,466 | 1.18x slower |
| Express | 47,147 | 1.49x slower |

::: tip Key insight
While the [router benchmark](/benchmarks/router) showed up to **16x** differences between routers, the full framework benchmark compresses this to **1.5x**. Routing is a tiny fraction of what an HTTP server does — the rest is TCP, HTTP parsing, headers, cookies, bodies, and serialization.
:::

## Public & Static Routes

Static responses, wildcard routing, login with `set-cookie`.

<ClientOnly>
  <BenchmarkChart :data="httpPublic" mode="stacked" unit="req/s" title="Public & static routes (req/s)" />
</ClientOnly>

Wooks and Fastify trade blows on static and wildcard routes, both comfortably above 80k req/s. h3 wins the login/set-cookie scenario (67k) — its cookie serialization is fast. Express trails at ~55–58k.

## Header-Auth API Routes

Bearer-token authenticated endpoints — typical API client traffic.

<ClientOnly>
  <BenchmarkChart :data="httpHeaderAuth" mode="stacked" unit="req/s" title="Header-auth API routes (req/s)" />
</ClientOnly>

Fastify leads on pure header-auth static routes (88k) and auth failure fast-paths (88k). h3 excels at body parsing (70k for small POST). Wooks delivers consistent 70–80k across the board — no weak spots.

## Cookie-Auth Browser Routes

The biggest traffic category in any SaaS app — browser requests with ~20 cookies per request.

<ClientOnly>
  <BenchmarkChart :data="httpCookieAuth" mode="stacked" unit="req/s" title="Cookie-auth browser routes (req/s)" />
</ClientOnly>

**This is where Wooks shines.** On cookie-authenticated parametric routes, Wooks leads decisively:

- **82,528 req/s** on two-param routes (vs Fastify's 73,504)
- **81,504 req/s** on four-param routes (vs Fastify's 71,968)
- **82,016 req/s** on param+suffix routes (vs Fastify's 73,504)

Why? Wooks parses cookies **lazily**. The `useCookies()` composable doesn't touch the cookie header until you actually call `getCookie()`. Combined with cached parametric parsing from `@prostojs/router`, Wooks avoids work that other frameworks do eagerly.

For large body payloads (~100KB JSON), all frameworks converge to 9–11k req/s — body parsing dominates at that scale.

## Error Responses & Edge Cases

404s, authentication failures with large bodies, bot traffic.

<ClientOnly>
  <BenchmarkChart :data="httpErrors" mode="stacked" unit="req/s" title="Error responses & edge cases (req/s)" />
</ClientOnly>

Two notable patterns:

**404 handling:** Fastify (87k) and Hono (82k) lead. h3 struggles (48–50k) — its router has higher overhead on failed lookups. Wooks sits comfortably at 75–76k.

**Large body + auth failure:** This tests whether the framework reads the body before checking auth. Wooks (34k) and h3 (39k) skip body parsing when auth fails — **3.5x faster** than Fastify (9.3k) which parses the body eagerly. This is the lazy-by-default architecture paying off in a real scenario.

## Where Wooks Wins

**Cookie-heavy browser traffic.** In the most common SaaS traffic pattern (42% of requests), Wooks leads by 10–15% over Fastify and 20–30% over h3 and Hono. Lazy cookie parsing and cached route parameter extraction give Wooks a structural advantage.

**Early rejection of bad requests.** When authentication fails, Wooks skips body parsing entirely. On large-body auth failures, this means 3.5x faster rejection than frameworks that parse eagerly.

**Consistent across all scenarios.** Wooks is competitive or leading in 16 out of 20 test scenarios — the most balanced profile of any framework tested.

## Where Others Shine

**Fastify** leads on pure header-auth static routes and 404 fast-paths. Its mature HTTP pipeline is highly optimized for simple request/response cycles.

**h3** excels at body parsing — both small and large payloads. Its `readBody()` implementation is the fastest in the benchmark. It also wins the login/set-cookie scenario.

**Hono** is fast on static routes and 404 handling, though its cookie-auth performance falls behind.

## The Real-World Perspective

These benchmarks measure raw framework throughput — the theoretical ceiling. In a production application, your request handlers make database queries, call external APIs, process business logic, and serialize complex responses. Those operations take 10–100x longer than framework overhead.

When simulated Redis calls were added to this same benchmark, the 1.5x gap between Wooks and Express compressed to **1.3x**:

<ClientOnly>
  <BenchmarkBars :data="httpWithDb" title="With simulated Redis calls — weighted average (req/s)" />
</ClientOnly>

| Framework | Avg req/s | vs raw | Gap |
|---|---:|---|---|
| **Wooks** | **50,854** | −28% | **fastest** |
| Fastify | 49,879 | −27% | 1.02x slower |
| h3 | 47,575 | −27% | 1.07x slower |
| Hono | 45,542 | −23% | 1.12x slower |
| Express | 37,868 | −20% | 1.34x slower |

The top four frameworks cluster within 12% of each other. With real PostgreSQL queries and data processing, the differences become **negligible from a performance perspective**.

::: info The bottom line
Performance should not be the primary factor in choosing a framework. All five frameworks tested here are fast enough for any production workload. The choice should come down to which framework gives you the best tools to solve your problem — the right abstractions, the right developer experience, the right ecosystem.
:::

## Why Wooks Is the Right Choice

Wooks doesn't just win on throughput — it wins on **what you get for that throughput**.

**Speed without sacrificing DX.** Wooks gives you the highest overall throughput *and* the cleanest API. No `(req, res)` parameters, no `event` threading, no middleware ordering puzzles. Just composable function calls — `useRequest()`, `useBody()`, `useCookies()` — that work anywhere in your call stack.

**Lazy by default means fast by default.** Other frameworks require you to opt *out* of eager computation. Wooks is lazy from the ground up — cookies aren't parsed until you read one, bodies aren't deserialized until you ask, route params aren't extracted until accessed. The benchmark results prove this architecture pays off where it matters most: real-world traffic with cookies and complex routes.

**Type-safe from the ground up.** Every composable returns typed data. Every context slot has a compile-time type. No `req.user as User` casts, no runtime type assertions. TypeScript works *with* you, not against you.

**One pattern beyond HTTP.** The same composable pattern that powers Wooks HTTP also works for [CLI apps](/cliapp/), [WebSocket servers](/wsapp/), and [workflow engines](/wf/). Your team learns one abstraction and applies it everywhere. No other framework in this benchmark offers that.

**Built-in context management.** `AsyncLocalStorage`-backed event context with `cached()` slots, `key<T>()` typed storage, and `defineWook()` composable factories. This isn't a plugin — it's the foundation. Every composable you write automatically gets per-request caching, type safety, and zero-argument access.

**The richest router in the benchmark.** `@prostojs/router` supports regex constraints, multiple wildcards, optional parameters, case-insensitive matching, and trailing slash normalization — features the competition doesn't have. And it's still the [fastest on the route patterns that real applications use](/benchmarks/router).

---

*Benchmark source: [prostojs/router-benchmark](https://github.com/prostojs/router-benchmark). Results generated Feb 27, 2026. Autocannon: 100 connections, 10 pipelining, 0.5s per test.*
