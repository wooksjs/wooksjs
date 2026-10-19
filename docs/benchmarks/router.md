<script setup>
// Source data (generated 2026-10-19; values = per-test median, op/ms, rounded):
//   https://raw.githubusercontent.com/prostojs/router-benchmark/refs/heads/main/packages/router-benchmark/results/results.json
//     variants.<short|long|mixed>.summary[router]           → summary consts
//     variants.long.perTest[test][router].median             → longDetailed
//   https://raw.githubusercontent.com/prostojs/router-benchmark/refs/heads/main/packages/router-benchmark/results/results-scale.json
//     variants.<shape>.<routerKey>.points[routeCount].median → scaling consts

// ── Router summary (by route type) ────────────────────────────────

const routerByType = {
  'Short routes': {
    'ProstoRouter': 41838,
    'Rou3 (compiled)': 142365,
    'Hono (RegExpRouter)': 50887,
    'Rou3': 56232,
    'FindMyWay': 34643,
    'Express': 2295,
  },
  'Long routes': {
    'ProstoRouter': 9446,
    'Rou3 (compiled)': 38823,
    'Hono (RegExpRouter)': 9157,
    'Rou3': 6555,
    'FindMyWay': 11262,
    'Express': 1107,
  },
  'Mixed routes': {
    'ProstoRouter': 29905,
    'Rou3 (compiled)': 56319,
    'Hono (RegExpRouter)': 53178,
    'Rou3': 30250,
    'FindMyWay': 27079,
    'Express': 2243,
  },
}

// ── Individual summary bars ────────────────────────────────────────

const summaryShort = {
  'Rou3 (compiled)': 142365,
  'Rou3': 56232,
  'Hono (RegExpRouter)': 50887,
  'ProstoRouter': 41838,
  'FindMyWay': 34643,
  'Express': 2295,
}

const summaryLong = {
  'Rou3 (compiled)': 38823,
  'FindMyWay': 11262,
  'ProstoRouter': 9446,
  'Hono (RegExpRouter)': 9157,
  'Rou3': 6555,
  'Express': 1107,
}

const summaryMixed = {
  'Rou3 (compiled)': 56319,
  'Hono (RegExpRouter)': 53178,
  'Rou3': 30250,
  'ProstoRouter': 29905,
  'FindMyWay': 27079,
  'Express': 2243,
}

// ── Long route breakdown ───────────────────────────────────────────

const longDetailed = {
  'Short static': {
    'ProstoRouter': 60102,
    'Rou3 (compiled)': 153256,
    'Hono (RegExpRouter)': 56801,
    'Rou3': 250813,
    'FindMyWay': 41564,
    'Express': 4113,
  },
  'Long static': {
    'ProstoRouter': 44433,
    'Rou3 (compiled)': 146620,
    'Hono (RegExpRouter)': 57156,
    'Rou3': 96301,
    'FindMyWay': 13970,
    'Express': 1978,
  },
  'Single param': {
    'ProstoRouter': 11313,
    'Rou3 (compiled)': 35944,
    'Hono (RegExpRouter)': 8515,
    'Rou3': 9563,
    'FindMyWay': 14704,
    'Express': 1902,
  },
  'Two params': {
    'ProstoRouter': 8958,
    'Rou3 (compiled)': 32441,
    'Hono (RegExpRouter)': 6959,
    'Rou3': 7684,
    'FindMyWay': 9437,
    'Express': 1138,
  },
  'Four params': {
    'ProstoRouter': 6381,
    'Rou3 (compiled)': 29057,
    'Hono (RegExpRouter)': 5280,
    'Rou3': 4503,
    'FindMyWay': 7069,
    'Express': 781,
  },
  'Wildcard': {
    'ProstoRouter': 10059,
    'Rou3 (compiled)': 30277,
    'Hono (RegExpRouter)': 12996,
    'Rou3': 6204,
    'FindMyWay': 22135,
    'Express': 1325,
  },
  'POST with params': {
    'ProstoRouter': 7877,
    'Rou3 (compiled)': 31757,
    'Hono (RegExpRouter)': 7998,
    'Rou3': 5691,
    'FindMyWay': 8542,
    'Express': 741,
  },
  '404 not found': {
    'ProstoRouter': 13409,
    'Rou3 (compiled)': 44931,
    'Hono (RegExpRouter)': 43250,
    'Rou3': 10112,
    'FindMyWay': 30177,
    'Express': 1756,
  },
}

// ── Scaling data ───────────────────────────────────────────────────
// results-scale.json keeps Hono as one series and labels the active backend
// per point (`points[n].backend`); it is split into two series here.

const scalingShort = {
  'ProstoRouter': { '22': 43455, '50': 14331, '100': 13527, '200': 12312 },
  'Rou3 (compiled)': { '22': 140539, '50': 39571, '100': 38955, '200': 38061 },
  'Hono (RegExpRouter)': { '22': 54905, '50': 14016, '100': 11111, '200': 7034 },
  'Rou3': { '22': 55082, '50': 19211, '100': 18595, '200': 14864 },
  'FindMyWay': { '22': 35071, '50': 20288, '100': 19139, '200': 15391 },
  'Express': { '22': 2332, '50': 983, '100': 607, '200': 281 },
}

const scalingLong = {
  'ProstoRouter': { '22': 9303, '50': 8148, '100': 6475, '200': 5048 },
  'Rou3 (compiled)': { '22': 36923, '50': 29845, '100': 30456, '200': 30928 },
  'Hono (RegExpRouter)': { '22': 8704, '50': 7580 },
  'Hono (TrieRouter)': { '100': 4465, '200': 4479 },
  'Rou3': { '22': 6857, '50': 6748, '100': 6649, '200': 6685 },
  'FindMyWay': { '22': 10862, '50': 10638, '100': 10490, '200': 10505 },
  'Express': { '22': 1110, '50': 1047, '100': 929, '200': 705 },
}

const scalingMixed = {
  'ProstoRouter': { '20': 28981, '48': 10864, '98': 8935, '198': 9335 },
  'Rou3 (compiled)': { '20': 56597, '48': 40181, '98': 36171, '198': 36727 },
  'Hono (RegExpRouter)': { '20': 53689, '48': 15047, '98': 7783 },
  'Hono (TrieRouter)': { '198': 4115 },
  'Rou3': { '20': 30311, '48': 15324, '98': 12002, '198': 10268 },
  'FindMyWay': { '20': 28167, '48': 15403, '98': 14580, '198': 14201 },
  'Express': { '20': 2265, '48': 1005, '98': 595, '198': 288 },
}

</script>

# Router Benchmark

How fast can each router match a URL to a handler and pull out parameters? This benchmark isolates just the routing layer — no HTTP, no middleware, just pure matching.

Full source code: [prostojs/router-benchmark](https://github.com/prostojs/router-benchmark)

## Routers Tested

| Router | Used by | Type |
|---|---|---|
| **[@prostojs/router](https://github.com/prostojs/router)** (ProstoRouter) | Wooks | Regex-based, indexed |
| **find-my-way** | Fastify | Radix trie |
| **rou3** | h3 / Nitro | Radix trie (`findRoute()`) |
| **rou3 (compiled)** | — | rou3's JIT compiler (`compileRouter()` from `rou3/compiler`) |
| **Hono SmartRouter** | Hono | RegExpRouter, falls back to TrieRouter when the route set cannot be compiled |
| **Express** | Express | Linear scan (baseline) |

## Methodology

Each router registers the same set of routes and resolves the same request mix. Every lookup performs **full parameter extraction** — not just matching — so routers that defer param processing get no advantage. Before measuring, all routers must return identical matches and params; each router runs in a fresh Node.js process.

The tests cover three route shapes: **short** paths (2–5 segments), **long** paths (5–10 segments), and a **mixed** 50/50 combination. The workload includes statics, parametric routes with up to 4 params, wildcards, multiple HTTP methods, and 404 misses.

Results are in **operations per millisecond** — higher is better.

::: info Indicative estimate
Single round on a laptop: Apple M4 MacBook Air (fanless), Node.js 24.22, 1 round × 5 samples per test. Treat differences of a few percent as noise.
:::

## Overview by Route Type

<ClientOnly>
  <BenchmarkChart :data="routerByType" mode="stacked" unit="ops/ms" title="All route types combined (ops/ms, stacked)" />
</ClientOnly>

::: tip Key takeaway
**Compiled rou3** is the fastest router on every route shape. **ProstoRouter** is mid-pack: 4th on short routes, 3rd on long routes (behind find-my-way) and 4th on mixed routes, well ahead of Express everywhere.
:::

### Short Routes (22 routes)

Typical REST APIs with 2–5 segment paths.

<ClientOnly>
  <BenchmarkBars :data="summaryShort" unit="ops/ms" title="Short routes — all tests combined" />
</ClientOnly>

Compiled rou3 is 2.5x ahead of the next router. Plain rou3 is second and Hono's RegExpRouter third; ProstoRouter is 3.4x behind the leader, ahead of find-my-way.

### Long Routes (22 routes)

Deep, nested paths with shared prefixes and multiple parameters, such as `/api/v1/orgs/:orgId/teams/:teamId/projects/:projectId/tasks/:taskId`.

<ClientOnly>
  <BenchmarkBars :data="summaryLong" unit="ops/ms" title="Long routes — all tests combined" />
</ClientOnly>

Compiled rou3 leads by 3.4x. find-my-way is second, 19% ahead of ProstoRouter; Hono (level with ProstoRouter) and plain rou3 follow.

### Mixed Routes (20 routes)

50/50 combination of short and long routes.

<ClientOnly>
  <BenchmarkBars :data="summaryMixed" unit="ops/ms" title="Mixed routes — all tests combined" />
</ClientOnly>

Compiled rou3 and Hono's RegExpRouter are close at the top. ProstoRouter and plain rou3 are level, about 1.9x behind; find-my-way is about 10% behind them.

## Long Route Breakdown

A closer look at individual long-route test patterns:

<ClientOnly>
  <BenchmarkChart :data="longDetailed" mode="stacked" unit="ops/ms" title="Long routes — per-test breakdown (ops/ms)" />
</ClientOnly>

**Static lookups:** plain rou3 is the fastest on the short static path, compiled rou3 on the long one. ProstoRouter's static lookups (44–60k ops/ms) are several times faster than its parametric ones.

**Parametric routes:** compiled rou3 leads every row by a wide margin, and find-my-way is ahead of ProstoRouter at every parameter count. ProstoRouter is ahead of Hono and plain rou3 on most of these rows.

**Wildcards:** compiled rou3, find-my-way and Hono are ahead of ProstoRouter.

**404 handling:** compiled rou3 and Hono's RegExpRouter reject non-matching URIs fastest; find-my-way follows. ProstoRouter and plain rou3 are well behind them.

## Scaling: 22 → 200 Routes {#scaling}

How throughput changes as the route table grows.

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

::: warning Hono switches routers as the route set grows
Hono's SmartRouter uses RegExpRouter while it can compile the route set, and TrieRouter otherwise. In this run it switched to TrieRouter from 100 long routes and at 198 mixed routes. Hono loses the most throughput on mixed routes as routes are added (13x from the smallest to the largest set); on short routes it loses 7.8x, about as much as Express (8.3x).
:::

| Router | Scaling behavior (smallest → largest route set) |
|---|---|
| **rou3 (compiled)** | Fastest at every size; drops 3.7x on short routes, 1.2x on long, 1.5x on mixed |
| **find-my-way** | Flat on long routes; drops 2–2.3x on short and mixed |
| **rou3** | Flat on long routes (6.6–6.9k); drops 3–3.7x on short and mixed |
| **ProstoRouter** | Drops 3.5x on short (mostly between 22 and 50 routes), 1.8x on long, 3.1x on mixed |
| **Hono** | 7.8x on short, 1.9x on long, 13x on mixed (the largest drop) |
| **Express** | Far behind at every size; drops 8.3x on short, 1.6x on long, 7.9x on mixed |

At 200 routes ProstoRouter is behind find-my-way and both rou3 variants on all three shapes, and ahead of Hono and Express.

## Feature Comparison

Raw lookup speed is only part of the picture. `@prostojs/router` supports matching features that not every router offers:

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

In a full HTTP server, routing is a small part of the per-request cost — see the [HTTP framework benchmark](/benchmarks/wooks-http).

---

*Benchmark source: [prostojs/router-benchmark](https://github.com/prostojs/router-benchmark). Results generated October 2026 (indicative estimate, single round on a laptop).*
