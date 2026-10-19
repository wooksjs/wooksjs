<script setup>
// Source data (generated 2026-10-19):
//   https://raw.githubusercontent.com/prostojs/router-benchmark/refs/heads/main/packages/wooks-benchmark/results/results.json
//   https://raw.githubusercontent.com/prostojs/router-benchmark/refs/heads/main/packages/wooks-benchmark/results/results-db.json

// ── HTTP framework benchmark data ──────────────────────────────────
// httpSummary / httpWithDb = summary[framework].mixRps (traffic-mix req/s,
// weighted harmonic mean); per-test groups = perTest[test].frameworks[fw].medianRps

const httpSummary = {
  'Fastify': 116447,
  'Wooks': 113670,
  'Hono': 95579,
  'h3': 84600,
  'Express': 59065,
}

const httpPublic = {
  'Short static': {
    'Wooks': 200781,
    'Fastify': 208400,
    'h3': 177950,
    'Hono': 181543,
    'Express': 100531,
  },
  'Login (set-cookie)': {
    'Wooks': 96567,
    'Fastify': 111213,
    'h3': 90688,
    'Hono': 77687,
    'Express': 64305,
  },
  'Wildcard + cache': {
    'Wooks': 179509,
    'Fastify': 201737,
    'h3': 139333,
    'Hono': 133462,
    'Express': 93327,
  },
  'Wildcard deep': {
    'Wooks': 172224,
    'Fastify': 203069,
    'h3': 136914,
    'Hono': 132884,
    'Express': 90773,
  },
}

const httpHeaderAuth = {
  'Static': {
    'Wooks': 192700,
    'Fastify': 205245,
    'h3': 170819,
    'Hono': 162689,
    'Express': 99459,
  },
  'Param': {
    'Wooks': 181910,
    'Fastify': 205368,
    'h3': 126153,
    'Hono': 156680,
    'Express': 97087,
  },
  'Long static + cache': {
    'Wooks': 187101,
    'Fastify': 197915,
    'h3': 149901,
    'Hono': 125683,
    'Express': 93039,
  },
  'POST small body': {
    'Wooks': 101974,
    'Fastify': 120406,
    'h3': 104774,
    'Hono': 93771,
    'Express': 64742,
  },
  'FAIL (401)': {
    'Wooks': 147657,
    'Fastify': 204044,
    'h3': 81051,
    'Hono': 163238,
    'Express': 96919,
  },
}

const httpCookieAuth = {
  'Param + suffix': {
    'Wooks': 161575,
    'Fastify': 144197,
    'h3': 101936,
    'Hono': 114996,
    'Express': 60862,
  },
  'Two params': {
    'Wooks': 160231,
    'Fastify': 146825,
    'h3': 102482,
    'Hono': 114756,
    'Express': 58289,
  },
  'Four params': {
    'Wooks': 153974,
    'Fastify': 145212,
    'h3': 98930,
    'Hono': 112134,
    'Express': 57046,
  },
  'POST small body': {
    'Wooks': 89296,
    'Fastify': 94473,
    'h3': 71051,
    'Hono': 72430,
    'Express': 45509,
  },
  'PUT small body': {
    'Wooks': 90063,
    'Fastify': 95022,
    'h3': 71867,
    'Hono': 73122,
    'Express': 46390,
  },
  'POST large body': {
    'Wooks': 13255,
    'Fastify': 12588,
    'h3': 13902,
    'Hono': 14177,
    'Express': 12541,
  },
  'FAIL (401)': {
    'Wooks': 140985,
    'Fastify': 199628,
    'h3': 80227,
    'Hono': 159815,
    'Express': 93133,
  },
}

const httpErrors = {
  '404 short': {
    'Wooks': 173079,
    'Fastify': 196482,
    'h3': 82696,
    'Hono': 174160,
    'Express': 98765,
  },
  '404 deep': {
    'Wooks': 166838,
    'Fastify': 191773,
    'h3': 80727,
    'Hono': 169182,
    'Express': 96786,
  },
  'Large body + bad header-auth': {
    'Wooks': 67941,
    'Fastify': 86229,
    'h3': 49066,
    'Hono': 69933,
    'Express': 58002,
  },
  'Large body + bad cookie-auth': {
    'Wooks': 66117,
    'Fastify': 86926,
    'h3': 47245,
    'Hono': 65058,
    'Express': 52863,
  },
}

// ── With simulated Redis calls ───────────────────────────────────────

const httpWithDb = {
  'Fastify': 87791,
  'Wooks': 82779,
  'Hono': 69204,
  'h3': 67771,
  'Express': 51933,
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
On a laptop: Apple M4 MacBook Air (fanless), Node.js 24.22, 1 s warmup + 2 s measured per test in a single round; the DB-mode run measured 1 s per test over 3 rounds. Treat differences of a few percent as noise.
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

**Fastify has the highest throughput, with Wooks 1.02x behind** — a 2% gap, within the noise of a single-round run — followed by Hono (1.22x), h3 (1.38x) and Express (1.97x).

::: tip Key insight
The [router benchmark](/benchmarks/router) shows differences of up to 62x between routers; in the full framework benchmark the fastest-to-slowest ratio is 1.97x. Routing is a small fraction of what an HTTP server does — the rest is TCP, HTTP parsing, headers, cookies, bodies, and serialization. Wooks' router is mid-pack in the router benchmark, yet Wooks is second here.
:::

## Public & Static Routes

Static responses, wildcard routing, login with `set-cookie`.

<ClientOnly>
  <BenchmarkChart :data="httpPublic" mode="stacked" unit="req/s" title="Public & static routes (req/s)" />
</ClientOnly>

Fastify is ahead on every test in this group: by 4% over Wooks on the short static route, 12% on the wildcard-with-cache route, 15% on login and 18% on the deep wildcard. Wooks is second on all four, ahead of Hono, h3 and Express.

## Header-Auth API Routes

Bearer-token authenticated endpoints — typical API client traffic.

<ClientOnly>
  <BenchmarkChart :data="httpHeaderAuth" mode="stacked" unit="req/s" title="Header-auth API routes (req/s)" />
</ClientOnly>

Fastify leads every test in this group. Wooks is second on the GET routes (6–13% behind Fastify) and 18% behind on the small POST, where h3 is slightly ahead of it. On the auth failure (401), Fastify and Hono are ahead of Wooks.

## Cookie-Auth Browser Routes

The biggest traffic category in a SaaS app — browser requests with ~20 cookies per request.

<ClientOnly>
  <BenchmarkChart :data="httpCookieAuth" mode="stacked" unit="req/s" title="Cookie-auth browser routes (req/s)" />
</ClientOnly>

**Wooks has the highest throughput on the cookie-authenticated GET routes** — 6–12% ahead of Fastify and 37–41% ahead of Hono.

Wooks parses cookies **lazily**: the `useCookies()` composable doesn't touch the cookie header until you call `getCookie()`.

On the small POST/PUT bodies Fastify is about 6% ahead of Wooks. On the large (~25 KB) JSON body all five are close (12,500–14,200 req/s): Hono and h3 lead, Wooks is third (13,255) ahead of Fastify and Express.

## Error Responses & Edge Cases

404s and large POST bodies with bad credentials (bot traffic).

<ClientOnly>
  <BenchmarkChart :data="httpErrors" mode="stacked" unit="req/s" title="Error responses & edge cases (req/s)" />
</ClientOnly>

**404 handling:** Fastify leads. Hono and Wooks are level on both; h3 and Express are well behind.

**Large body + auth failure:** every framework in this benchmark checks auth before parsing the body, so none of them parses these bodies. Fastify is the fastest here; Wooks and Hono are level, ahead of Express and h3.

## Where Wooks Leads

**Cookie-authenticated reads.** In the largest traffic category, Wooks has the highest throughput of the five frameworks, helped by lazy cookie parsing.

**Consistently near the top.** Wooks is first or second on 14 of the 20 tests and 1.02x behind Fastify on the traffic mix; Hono, h3 and Express are further behind.

## Where Wooks Trails

**Auth failures, 404s and login.** Fastify handles these faster than Wooks, and Hono is ahead of Wooks on auth failures and level on 404s.

**Fastify** leads most of the non-cookie tests: static and wildcard routes, header-auth routes, small bodies, auth failures and 404s. **Hono** and **h3** are the fastest on the large JSON body, though all five are within 13% of each other there.

## The Real-World Perspective

These benchmarks measure raw framework throughput — the theoretical ceiling. In a real application, your handlers make database queries, call external APIs, and process business logic, and those take far longer than the framework's own work.

With a simulated Redis call in every authenticated handler, the gap between the fastest and the slowest framework narrows:

<ClientOnly>
  <BenchmarkBars :data="httpWithDb" title="With simulated Redis calls — traffic-mix throughput (req/s)" />
</ClientOnly>

The fastest-to-slowest ratio drops from 1.97x to 1.69x. Wooks stays second, 1.06x behind Fastify: with the DB call Fastify is 3–6% ahead of Wooks on the cookie-auth reads and further ahead on the header-auth and wildcard routes, while Wooks stays well ahead of Hono, h3 and Express.

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

*Benchmark source: [prostojs/router-benchmark](https://github.com/prostojs/router-benchmark). Results generated October 2026 (indicative estimate on a laptop: single round, DB mode 3 rounds).*
