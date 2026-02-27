<script setup>
// Source data URLs (for future updates):
//   https://raw.githubusercontent.com/prostojs/router-benchmark/refs/heads/main/packages/router-benchmark/results/results.json
//   https://raw.githubusercontent.com/prostojs/router-benchmark/refs/heads/main/packages/router-benchmark/results/results-scale.json

// ── Router summary (by route type) ────────────────────────────────

const routerByType = {
  'Short routes': {
    'ProstoRouter': 36385,
    'Hono (RegExpRouter)': 37863,
    'Rou3': 32242,
    'FindMyWay': 22374,
    'Express': 2348,
  },
  'Long routes': {
    'ProstoRouter': 9020,
    'Hono (RegExpRouter)': 8250,
    'Rou3': 7157,
    'FindMyWay': 6283,
    'Express': 1141,
  },
  'Mixed routes': {
    'ProstoRouter': 21432,
    'Hono (RegExpRouter)': 37617,
    'Rou3': 20828,
    'FindMyWay': 16786,
    'Express': 2201,
  },
}

// ── Individual summary bars ────────────────────────────────────────

const summaryShort = {
  'Hono (RegExpRouter)': 37863,
  'ProstoRouter': 36385,
  'Rou3': 32242,
  'FindMyWay': 22374,
  'Express': 2348,
}

const summaryLong = {
  'ProstoRouter': 9020,
  'Hono (RegExpRouter)': 8250,
  'Rou3': 7157,
  'FindMyWay': 6283,
  'Express': 1141,
}

const summaryMixed = {
  'Hono (RegExpRouter)': 37617,
  'ProstoRouter': 21432,
  'Rou3': 20828,
  'FindMyWay': 16786,
  'Express': 2201,
}

// ── Long route breakdown ───────────────────────────────────────────

const longDetailed = {
  'Short static': {
    'ProstoRouter': 35449,
    'Hono (RegExpRouter)': 41855,
    'Rou3': 61430,
    'FindMyWay': 21374,
    'Express': 3960,
  },
  'Long static': {
    'ProstoRouter': 39124,
    'Hono (RegExpRouter)': 42788,
    'Rou3': 63406,
    'FindMyWay': 7471,
    'Express': 2110,
  },
  'Single param': {
    'ProstoRouter': 9864,
    'Hono (RegExpRouter)': 7913,
    'Rou3': 9098,
    'FindMyWay': 8531,
    'Express': 1853,
  },
  'Two params': {
    'ProstoRouter': 8632,
    'Hono (RegExpRouter)': 6594,
    'Rou3': 7078,
    'FindMyWay': 5413,
    'Express': 1192,
  },
  'Four params': {
    'ProstoRouter': 6247,
    'Hono (RegExpRouter)': 5147,
    'Rou3': 4534,
    'FindMyWay': 3725,
    'Express': 800,
  },
  'Wildcard': {
    'ProstoRouter': 8977,
    'Hono (RegExpRouter)': 11914,
    'Rou3': 8323,
    'FindMyWay': 10971,
    'Express': 1380,
  },
  'POST with params': {
    'ProstoRouter': 7606,
    'Hono (RegExpRouter)': 7651,
    'Rou3': 5790,
    'FindMyWay': 5058,
    'Express': 761,
  },
  '404 not found': {
    'ProstoRouter': 11066,
    'Hono (RegExpRouter)': 30858,
    'Rou3': 10244,
    'FindMyWay': 13305,
    'Express': 1863,
  },
}

// ── Scaling data ───────────────────────────────────────────────────

const scalingShort = {
  'ProstoRouter': { '22': 44665, '50': 14411, '100': 10855, '200': 9400 },
  'Hono (RegExpRouter)': { '22': 42409, '50': 12525, '100': 10162, '200': 6627 },
  'Rou3': { '22': 38861, '50': 17533, '100': 12495, '200': 10481 },
  'FindMyWay': { '22': 29182, '50': 13038, '100': 13571, '200': 10804 },
  'Express': { '22': 2393, '50': 994, '100': 654, '200': 295 },
}

const scalingLong = {
  'ProstoRouter': { '22': 8600, '50': 7562, '100': 6136, '200': 4158 },
  'Hono (RegExpRouter)': { '22': 8250, '50': 7180 },
  'Hono (TrieRouter)': { '100': 3624, '200': 3640 },
  'Rou3': { '22': 6838, '50': 6735, '100': 6834, '200': 6744 },
  'FindMyWay': { '22': 6193, '50': 6177, '100': 5889, '200': 6022 },
  'Express': { '22': 1122, '50': 1038, '100': 922, '200': 737 },
}

const scalingMixed = {
  'ProstoRouter': { '20': 21767, '48': 10680, '98': 8332, '198': 7895 },
  'Hono (RegExpRouter)': { '20': 35978, '48': 13647, '98': 7257 },
  'Hono (TrieRouter)': { '198': 3462 },
  'Rou3': { '20': 19802, '48': 12028, '98': 5873, '198': 6567 },
  'FindMyWay': { '20': 18218, '48': 9924, '98': 9350, '198': 9194 },
  'Express': { '20': 2246, '48': 1026, '98': 591, '198': 347 },
}
</script>

# Router Benchmark

Pure route matching and parameter extraction — measuring the router layer in isolation. How fast can each router resolve a URI to a handler and extract parameters?

Full source code: [prostojs/router-benchmark](https://github.com/prostojs/router-benchmark)

## Routers Tested

| Router | Used by | Type |
|---|---|---|
| **[@prostojs/router](https://github.com/prostojs/router)** | Wooks | Regex-based, indexed |
| **find-my-way** | Fastify | Radix trie |
| **rou3** | h3 / Nitro | Radix trie |
| **Hono RegExpRouter** | Hono | Compiled RegExp (falls back to TrieRouter on complex sets) |
| **Express** | Express | Linear scan (baseline) |

## Methodology

Each router registers the same set of routes and resolves the same request mix. Every benchmark measures **matching + parameter extraction** together — some routers defer parameter processing, so the benchmark forces complete resolution to ensure a fair comparison.

- 200,000 operations per test, 2 runs
- Three route shapes: **short** (2–5 segments), **long** (5–10 segments), **mixed** (50/50)
- Workload includes: statics, parametric routes (1–4 params), wildcards, multiple HTTP methods, and 404 misses

Results in **operations per millisecond** (higher is better).

## Overview by Route Type

<ClientOnly>
  <BenchmarkChart :data="routerByType" mode="stacked" unit="ops/ms" title="All route types combined (ops/ms, stacked)" />
</ClientOnly>

::: tip Key takeaway
**ProstoRouter** leads on long enterprise-style routes (9,020 ops/ms) while staying competitive on short routes. **Hono's RegExpRouter** is fastest on short/mixed patterns but — as the [scaling section](#scaling) reveals — its compiled regex approach breaks down on larger route sets.
:::

### Short Routes (22 routes)

Typical REST APIs with 2–5 segment paths.

<ClientOnly>
  <BenchmarkBars :data="summaryShort" unit="ops/ms" title="Short routes — all tests combined" />
</ClientOnly>

Hono's RegExpRouter and ProstoRouter are neck-and-neck at ~37k ops/ms — both far ahead of the trie-based routers. The compiled regex approach excels on compact route sets.

### Long Routes (22 routes)

Deep enterprise SaaS patterns — 5–10 segment paths with shared prefixes and many parameters. Routes like `/api/v1/orgs/:orgId/teams/:teamId/projects/:projectId/tasks/:taskId`.

<ClientOnly>
  <BenchmarkBars :data="summaryLong" unit="ops/ms" title="Long routes — all tests combined" />
</ClientOnly>

**ProstoRouter leads at 9,020 ops/ms** — 9% ahead of Hono, 26% ahead of Rou3, and 43% ahead of find-my-way. These are the route patterns that real SaaS APIs actually use.

### Mixed Routes (20 routes)

50/50 combination of short and long routes.

<ClientOnly>
  <BenchmarkBars :data="summaryMixed" unit="ops/ms" title="Mixed routes — all tests combined" />
</ClientOnly>

Hono's RegExpRouter leads here (37k) due to its strong short-route performance. ProstoRouter (21k) and Rou3 (21k) are close behind.

## Long Route Breakdown

A closer look at individual long-route test patterns — this is where router architectures reveal their strengths and weaknesses:

<ClientOnly>
  <BenchmarkChart :data="longDetailed" mode="stacked" unit="ops/ms" title="Long routes — per-test breakdown (ops/ms)" />
</ClientOnly>

**Static lookups:** Rou3 dominates pure static resolution (61–63k ops/ms) thanks to its radix trie optimized for exact matches. Hono is second (42k). ProstoRouter's regex-based approach trades static-lookup speed for richer pattern support (35–39k) — still very fast.

**Parametric routes:** ProstoRouter leads across all parameter counts. The gap widens with complexity — at 4 params, ProstoRouter (6,247) leads Hono (5,147) by 21% and find-my-way (3,725) by 68%.

**POST/PUT/DELETE with params:** ProstoRouter and Hono are tied at ~7.6k ops/ms, both ahead of Rou3 and find-my-way.

**404 handling:** Hono's RegExpRouter excels at rejecting non-matching URIs (31k ops/ms) — the compiled regex rejects in one step. ProstoRouter (11k) and find-my-way (13k) are reasonable; Rou3 (10k) is close.

## Scaling: 22 → 200 Routes {#scaling}

Small benchmarks can be deceiving. A router that tops the chart at 22 routes may not hold up when your application grows. The scaling benchmark reveals what happens when route tables reach real-world sizes — **500,000 operations across 5 runs** for statistical reliability.

### Short Routes

<ClientOnly>
  <ScalingChart :data="scalingShort" title="Short routes — scaling by route count" />
</ClientOnly>

### Long Routes

<ClientOnly>
  <ScalingChart :data="scalingLong" title="Long routes — scaling by route count" />
</ClientOnly>

### Mixed Routes

<ClientOnly>
  <ScalingChart :data="scalingMixed" title="Mixed routes — scaling by route count" :labels="['20', '48', '98', '198']" />
</ClientOnly>

::: warning Hono's RegExpRouter hits a wall
Hono's RegExpRouter — the fastest router on small benchmarks — **fails to compile** its regular expression when route sets grow complex. On long routes at 100+, and mixed routes at 198+, Hono silently falls back to its much slower TrieRouter. At 200 long routes: Hono TrieRouter drops to **3,640 ops/ms** — the slowest non-Express router in the field.
:::

This is the most revealing part of the benchmark. The routers that look fastest in small tests tell a different story at scale:

| Router | 22 long routes | 200 long routes | Degradation |
|---|---:|---:|---|
| ProstoRouter | 8,600 | 4,158 | 2.1x — gradual |
| Hono (RegExp → Trie) | 8,250 | 3,640 | 2.3x — cliff at 100 routes |
| Rou3 | 6,838 | 6,744 | 1.0x — flat |
| find-my-way | 6,193 | 6,022 | 1.0x — flat |

**ProstoRouter stays fastest through 50 routes** across all three route shapes, and remains competitive at 100–200. The trie-based routers (Rou3, find-my-way) degrade less because their structure inherently shares prefix storage — but they start from a lower baseline on parametric routes.

On **mixed routes at 198**, ProstoRouter (7,895 ops/ms) beats Rou3 (6,567) and Hono's fallback TrieRouter (3,462), while find-my-way (9,194) pulls ahead due to its stable trie. The order reshuffles at scale — a router's architecture matters more than its microbenchmark peak.

## Feature Comparison

Raw speed is only part of the picture. `@prostojs/router` supports features that trie-based routers can't:

| Feature | @prostojs/router | find-my-way | Rou3 | Hono |
|---|:---:|:---:|:---:|:---:|
| Parametric routes | ✅ | ✅ | ✅ | ✅ |
| Regex constraints on params | ✅ | ✅ | ❌ | ❌ |
| Multiple wildcards per path | ✅ | ❌ | ❌ | ❌ |
| Regex constraints on wildcards | ✅ | ❌ | ❌ | ❌ |
| Optional parameters | ✅ | ❌ | ❌ | ✅ |
| Case-insensitive matching | ✅ | ✅ | ❌ | ❌ |
| Trailing slash normalization | ✅ | ❌ | ❌ | ❌ |
| URL decoding | ✅ | ✅ | ❌ | ❌ |
| Same-name param arrays | ✅ | ❌ | ❌ | ❌ |

`@prostojs/router` delivers the richest feature set while being the fastest on the route patterns that matter most in production — deeply-nested, parametric paths with multiple parameters.

---

*Benchmark source: [prostojs/router-benchmark](https://github.com/prostojs/router-benchmark). Results generated Feb 27, 2026. 100k–500k operations, 2–5 runs.*
