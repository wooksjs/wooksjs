<script setup>
// Source data (generated 2026-10-19):
//   https://raw.githubusercontent.com/prostojs/router-benchmark/refs/heads/main/packages/wooks-benchmark/results/results.json
//   https://raw.githubusercontent.com/prostojs/router-benchmark/refs/heads/main/packages/wooks-benchmark/results/results-db.json

// ── HTTP framework benchmark data ──────────────────────────────────
// httpSummary / httpWithDb = summary[framework].mixRps (traffic-mix req/s,
// weighted harmonic mean); per-test groups = perTest[test].frameworks[fw].medianRps

const httpSummary = {
  'Fastify': 115880,
  'Wooks': 107749,
  'Hono': 98364,
  'h3': 86165,
  'Express': 63060,
}

const httpPublic = {
  'Short static': {
    'Wooks': 203027,
    'Fastify': 208728,
    'h3': 177668,
    'Hono': 196876,
    'Express': 109794,
  },
  'Login (set-cookie)': {
    'Wooks': 96806,
    'Fastify': 112849,
    'h3': 93125,
    'Hono': 81680,
    'Express': 67725,
  },
  'Wildcard + cache': {
    'Wooks': 184294,
    'Fastify': 194443,
    'h3': 139541,
    'Hono': 139187,
    'Express': 97024,
  },
  'Wildcard deep': {
    'Wooks': 176743,
    'Fastify': 200077,
    'h3': 138699,
    'Hono': 141025,
    'Express': 96014,
  },
}

const httpHeaderAuth = {
  'Static': {
    'Wooks': 200719,
    'Fastify': 206265,
    'h3': 171945,
    'Hono': 169154,
    'Express': 104448,
  },
  'Param': {
    'Wooks': 187336,
    'Fastify': 201067,
    'h3': 156537,
    'Hono': 162230,
    'Express': 102290,
  },
  'Long static + cache': {
    'Wooks': 187236,
    'Fastify': 190313,
    'h3': 153329,
    'Hono': 130159,
    'Express': 97746,
  },
  'POST small body': {
    'Wooks': 102785,
    'Fastify': 123533,
    'h3': 102789,
    'Hono': 97660,
    'Express': 68286,
  },
  'FAIL (401)': {
    'Wooks': 150297,
    'Fastify': 199486,
    'h3': 79459,
    'Hono': 169490,
    'Express': 104780,
  },
}

const httpCookieAuth = {
  'Param + suffix': {
    'Wooks': 166358,
    'Fastify': 146671,
    'h3': 104379,
    'Hono': 120472,
    'Express': 69712,
  },
  'Two params': {
    'Wooks': 164062,
    'Fastify': 143713,
    'h3': 104620,
    'Hono': 119330,
    'Express': 66899,
  },
  'Four params': {
    'Wooks': 156565,
    'Fastify': 143413,
    'h3': 100112,
    'Hono': 116922,
    'Express': 64084,
  },
  'POST small body': {
    'Wooks': 91258,
    'Fastify': 95225,
    'h3': 72223,
    'Hono': 76055,
    'Express': 45834,
  },
  'PUT small body': {
    'Wooks': 91891,
    'Fastify': 95894,
    'h3': 73192,
    'Hono': 76090,
    'Express': 46482,
  },
  'POST large body': {
    'Wooks': 9380,
    'Fastify': 12658,
    'h3': 13865,
    'Hono': 13701,
    'Express': 12526,
  },
  'FAIL (401)': {
    'Wooks': 141794,
    'Fastify': 201357,
    'h3': 79219,
    'Hono': 167076,
    'Express': 92175,
  },
}

const httpErrors = {
  '404 short': {
    'Wooks': 171582,
    'Fastify': 191514,
    'h3': 83680,
    'Hono': 181131,
    'Express': 98769,
  },
  '404 deep': {
    'Wooks': 170276,
    'Fastify': 192648,
    'h3': 81537,
    'Hono': 169034,
    'Express': 102443,
  },
  'Large body + bad header-auth': {
    'Wooks': 68858,
    'Fastify': 83772,
    'h3': 49096,
    'Hono': 67501,
    'Express': 57177,
  },
  'Large body + bad cookie-auth': {
    'Wooks': 66564,
    'Fastify': 78540,
    'h3': 47330,
    'Hono': 65670,
    'Express': 52424,
  },
}

// ── With simulated Redis calls ───────────────────────────────────────

const httpWithDb = {
  'Fastify': 78315,
  'Wooks': 75499,
  'Hono': 61399,
  'h3': 60826,
  'Express': 48914,
}

</script>

# HTTP Framework Benchmark

How does Wooks compare with Express, Fastify, h3 and Hono? This isn't a "hello world" test — it exercises the full HTTP request lifecycle of a realistic API.

Full source code: [prostojs/router-benchmark](https://github.com/prostojs/router-benchmark)

## Why Not "Hello World"?

Most framework benchmarks test a single `GET /` route returning a string. That tells you little about real-world performance, where every request involves routing, header inspection, cookie parsing, auth checks, body parsing, and response serialization.

This benchmark simulates a **project management SaaS API** with 22 routes across three authentication tiers.

## Frameworks Tested

| Framework | Router |
|---|---|
| **Wooks** | @prostojs/router |
| **Fastify** | find-my-way |
| **h3** | rou3 |
| **Hono** | SmartRouter (RegExpRouter / TrieRouter) |
| **Express** | Express router (baseline) |

## Methodology

Load is generated with [autocannon](https://github.com/mcollina/autocannon) (100 connections, pipelining 10) across 20 test scenarios. Each framework runs in its own server process, started fresh for each round.

Every request goes through the full HTTP lifecycle — routing, header inspection, cookie parsing (a realistic ~20-cookie jar), auth checks, body parsing, and response serialization. Before measuring, a pre-flight check verifies that every server returns the same status codes, bodies and headers. Every framework checks auth before parsing the request body, and handlers are synchronous unless they read the body.

::: info Indicative estimate
Single round on a laptop: Apple M4 MacBook Air (fanless), Node.js 24.22, 1 s warmup + 2 s measured per test (1 s in DB mode). Treat differences of a few percent as noise.
:::

### Traffic Distribution

Tests are weighted to reflect what a SaaS app typically sees:

| Traffic type | Weight |
|---|---|
| Cookie-auth reads (browser) | 42% |
| Cookie-auth writes (browser) | 18% |
| Header-auth (API clients) | 16% |
| Public / static | 10% |
| Auth failures | 5% |
| 404 responses | 5% |
| Bot / scanner traffic | 4% |

The headline number is the **traffic-mix throughput**: the weighted *harmonic* mean of the per-test results, i.e. the req/s of a server receiving this request mix. Unlike an arithmetic average, it gives slow tests their real share of server time.

## Overall Throughput

Traffic-mix throughput across all 20 test scenarios:

<ClientOnly>
  <BenchmarkBars :data="httpSummary" title="Traffic-mix throughput (req/s)" />
</ClientOnly>

**Fastify has the highest throughput, with Wooks 1.08x behind**, followed by Hono (1.18x), h3 (1.34x) and Express (1.84x).

Most of the gap between Wooks and Fastify comes from a single test, the large JSON body POST (2% of traffic): Wooks is the slowest framework on it, and a harmonic mean weights slow tests heavily. Without that test, Wooks and Fastify are level (both about 143k req/s).

::: tip Key insight
The [router benchmark](/benchmarks/router) shows differences of up to 56x between routers; in the full framework benchmark the fastest-to-slowest ratio is 1.84x. Routing is a small fraction of what an HTTP server does — the rest is TCP, HTTP parsing, headers, cookies, bodies, and serialization. Wooks' router is mid-pack in the router benchmark, yet Wooks is second here.
:::

## Public & Static Routes

Static responses, wildcard routing, login with `set-cookie`.

<ClientOnly>
  <BenchmarkChart :data="httpPublic" mode="stacked" unit="req/s" title="Public & static routes (req/s)" />
</ClientOnly>

Fastify is ahead on every test in this group: by 3–6% over Wooks on static and wildcard-with-cache routes, 13% on the deep wildcard, and 17% on login. Wooks is second on all four, ahead of Hono, h3 and Express.

## Header-Auth API Routes

Bearer-token authenticated endpoints — typical API client traffic.

<ClientOnly>
  <BenchmarkChart :data="httpHeaderAuth" mode="stacked" unit="req/s" title="Header-auth API routes (req/s)" />
</ClientOnly>

Fastify leads every test in this group. Wooks is close on the GET routes (2–7% behind) and 20% behind on the small POST, where it is level with h3. On the auth failure (401), Fastify and Hono are ahead of Wooks.

## Cookie-Auth Browser Routes

The biggest traffic category in a SaaS app — browser requests with ~20 cookies per request.

<ClientOnly>
  <BenchmarkChart :data="httpCookieAuth" mode="stacked" unit="req/s" title="Cookie-auth browser routes (req/s)" />
</ClientOnly>

**Wooks has the highest throughput on the cookie-authenticated GET routes** — 9–14% ahead of Fastify and 34–38% ahead of Hono.

Wooks parses cookies **lazily**: the `useCookies()` composable doesn't touch the cookie header until you call `getCookie()`.

On the small POST/PUT bodies Fastify is about 4% ahead of Wooks. On the large (~25 KB) JSON body, Wooks is the slowest of the five (9,380 req/s vs 12,500–13,900 for the others).

## Error Responses & Edge Cases

404s and large POST bodies with bad credentials (bot traffic).

<ClientOnly>
  <BenchmarkChart :data="httpErrors" mode="stacked" unit="req/s" title="Error responses & edge cases (req/s)" />
</ClientOnly>

**404 handling:** Fastify leads. Hono is ahead of Wooks on the short 404 and level on the deep one; h3 and Express are well behind.

**Large body + auth failure:** every framework in this benchmark checks auth before parsing the body, so none of them parses these bodies. Fastify is the fastest here; Wooks and Hono are level, ahead of Express and h3.

## Where Wooks Leads

**Cookie-authenticated reads.** In the largest traffic category, Wooks has the highest throughput of the five frameworks, helped by lazy cookie parsing.

**Consistently near the top.** Wooks is first or second on 15 of the 20 tests and 1.08x behind Fastify on the traffic mix; Hono, h3 and Express are further behind.

## Where Wooks Trails

**Large JSON bodies.** Wooks is the slowest framework on the ~25 KB POST, and that one test accounts for most of its gap to Fastify in the traffic mix.

**Auth failures, 404s and login.** Fastify (and Hono on 401s and the short 404) handles these faster than Wooks.

**Fastify** leads most of the non-cookie tests: static and wildcard routes, header-auth routes, small bodies, auth failures and 404s. **h3** is the fastest on the large JSON body, with Hono close behind. **Hono** is ahead of Wooks on auth failures.

## The Real-World Perspective

These benchmarks measure raw framework throughput — the theoretical ceiling. In a real application, your handlers make database queries, call external APIs, and process business logic, and those take far longer than the framework's own work.

With a simulated Redis call in every authenticated handler, the gap between frameworks narrows:

<ClientOnly>
  <BenchmarkBars :data="httpWithDb" title="With simulated Redis calls — traffic-mix throughput (req/s)" />
</ClientOnly>

Fastify and Wooks are within 4% of each other, and the fastest-to-slowest ratio drops from 1.84x to 1.60x. With the DB call, Wooks and Fastify are level on the cookie-auth reads.

::: info The bottom line
Performance alone shouldn't drive your framework choice. All five frameworks tested here handle tens of thousands of requests per second on a single process. Pick the one that gives you the best abstractions, developer experience, and ecosystem for your problem, and measure your own workload if speed matters.
:::

## What Wooks Offers

**Composable API.** No `(req, res)` threading, no middleware ordering puzzles. Just composable functions — `useRequest()`, `useBody()`, `useCookies()` — that work anywhere in your call stack.

**Lazy by default.** Cookies aren't parsed until you read one. Bodies aren't deserialized until you ask. Route params aren't extracted until accessed. If a handler rejects early, it never pays for the data it didn't read.

**Type-safe from the ground up.** Every composable returns typed data. No `req.user as User` casts, no runtime type assertions.

**One pattern beyond HTTP.** The same composable pattern powers [CLI apps](/cliapp/), [WebSocket servers](/wsapp/), and [workflow engines](/wf/). Learn one abstraction, apply it everywhere.

**Built-in context management.** `AsyncLocalStorage`-backed event context with `cached()` slots, typed storage, and composable factories. Every composable you write gets per-request caching, type safety, and zero-argument access.

**A feature-rich router.** `@prostojs/router` supports regex constraints, multiple wildcards, optional parameters, case-insensitive matching, and trailing slash normalization. See the [router benchmark](/benchmarks/router) for its lookup speed.

---

*Benchmark source: [prostojs/router-benchmark](https://github.com/prostojs/router-benchmark). Results generated October 2026 (indicative estimate, single round on a laptop).*
