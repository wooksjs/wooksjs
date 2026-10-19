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
    'ProstoRouter': 43488,
    'Rou3 (compiled)': 135452,
    'Hono (RegExpRouter)': 56638,
    'Rou3': 56277,
    'FindMyWay': 34096,
    'Express': 2438,
  },
  'Long routes': {
    'ProstoRouter': 9604,
    'Rou3 (compiled)': 39335,
    'Hono (RegExpRouter)': 8906,
    'Rou3': 6537,
    'FindMyWay': 11090,
    'Express': 1144,
  },
  'Mixed routes': {
    'ProstoRouter': 29171,
    'Rou3 (compiled)': 56940,
    'Hono (RegExpRouter)': 53412,
    'Rou3': 30704,
    'FindMyWay': 28068,
    'Express': 2177,
  },
}

// ── Individual summary bars ────────────────────────────────────────

const summaryShort = {
  'Rou3 (compiled)': 135452,
  'Hono (RegExpRouter)': 56638,
  'Rou3': 56277,
  'ProstoRouter': 43488,
  'FindMyWay': 34096,
  'Express': 2438,
}

const summaryLong = {
  'Rou3 (compiled)': 39335,
  'FindMyWay': 11090,
  'ProstoRouter': 9604,
  'Hono (RegExpRouter)': 8906,
  'Rou3': 6537,
  'Express': 1144,
}

const summaryMixed = {
  'Rou3 (compiled)': 56940,
  'Hono (RegExpRouter)': 53412,
  'Rou3': 30704,
  'ProstoRouter': 29171,
  'FindMyWay': 28068,
  'Express': 2177,
}

// ── Long route breakdown ───────────────────────────────────────────

const longDetailed = {
  'Short static': {
    'ProstoRouter': 62571,
    'Rou3 (compiled)': 154698,
    'Hono (RegExpRouter)': 57277,
    'Rou3': 250381,
    'FindMyWay': 41997,
    'Express': 4177,
  },
  'Long static': {
    'ProstoRouter': 47629,
    'Rou3 (compiled)': 151102,
    'Hono (RegExpRouter)': 57891,
    'Rou3': 96881,
    'FindMyWay': 14233,
    'Express': 2030,
  },
  'Single param': {
    'ProstoRouter': 10891,
    'Rou3 (compiled)': 36555,
    'Hono (RegExpRouter)': 8572,
    'Rou3': 9540,
    'FindMyWay': 14875,
    'Express': 1920,
  },
  'Two params': {
    'ProstoRouter': 8644,
    'Rou3 (compiled)': 32998,
    'Hono (RegExpRouter)': 7012,
    'Rou3': 7736,
    'FindMyWay': 9259,
    'Express': 1124,
  },
  'Four params': {
    'ProstoRouter': 5929,
    'Rou3 (compiled)': 29279,
    'Hono (RegExpRouter)': 5209,
    'Rou3': 4462,
    'FindMyWay': 6924,
    'Express': 793,
  },
  'Wildcard': {
    'ProstoRouter': 10561,
    'Rou3 (compiled)': 31133,
    'Hono (RegExpRouter)': 13169,
    'Rou3': 6223,
    'FindMyWay': 22003,
    'Express': 1338,
  },
  'POST with params': {
    'ProstoRouter': 7961,
    'Rou3 (compiled)': 32382,
    'Hono (RegExpRouter)': 8354,
    'Rou3': 5595,
    'FindMyWay': 8941,
    'Express': 750,
  },
  '404 not found': {
    'ProstoRouter': 12864,
    'Rou3 (compiled)': 45141,
    'Hono (RegExpRouter)': 42297,
    'Rou3': 10155,
    'FindMyWay': 29273,
    'Express': 1780,
  },
}

// ── Scaling data ───────────────────────────────────────────────────
// results-scale.json keeps Hono as one series and labels the active backend
// per point (`points[n].backend`); it is split into two series here.

const scalingShort = {
  'ProstoRouter': { '22': 43846, '50': 13815, '100': 14018, '200': 12457 },
  'Rou3 (compiled)': { '22': 136846, '50': 39929, '100': 39308, '200': 38184 },
  'Hono (RegExpRouter)': { '22': 56849, '50': 13751, '100': 11226, '200': 6990 },
  'Rou3': { '22': 54610, '50': 19960, '100': 18345, '200': 14981 },
  'FindMyWay': { '22': 35058, '50': 19641, '100': 19711, '200': 14889 },
  'Express': { '22': 2384, '50': 970, '100': 637, '200': 297 },
}

const scalingLong = {
  'ProstoRouter': { '22': 8794, '50': 7739, '100': 6421, '200': 5167 },
  'Rou3 (compiled)': { '22': 37150, '50': 29886, '100': 30720, '200': 30924 },
  'Hono (RegExpRouter)': { '22': 8894, '50': 7505 },
  'Hono (TrieRouter)': { '100': 4505, '200': 4521 },
  'Rou3': { '22': 4877, '50': 6733, '100': 4868, '200': 6738 },
  'FindMyWay': { '22': 10816, '50': 10639, '100': 10479, '200': 10540 },
  'Express': { '22': 1131, '50': 1059, '100': 937, '200': 697 },
}

const scalingMixed = {
  'ProstoRouter': { '20': 29220, '48': 11505, '98': 9366, '198': 9004 },
  'Rou3 (compiled)': { '20': 57038, '48': 41001, '98': 36674, '198': 36419 },
  'Hono (RegExpRouter)': { '20': 52955, '48': 15128, '98': 7801 },
  'Hono (TrieRouter)': { '198': 4072 },
  'Rou3': { '20': 30839, '48': 15834, '98': 11981, '198': 10736 },
  'FindMyWay': { '20': 28315, '48': 15967, '98': 14542, '198': 14230 },
  'Express': { '20': 2206, '48': 949, '98': 601, '198': 286 },
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

Compiled rou3 is 2.4x ahead of the next router. Hono's RegExpRouter and plain rou3 are level in second place; ProstoRouter is 3.1x behind the leader, ahead of find-my-way.

### Long Routes (22 routes)

Deep, nested paths with shared prefixes and multiple parameters, such as `/api/v1/orgs/:orgId/teams/:teamId/projects/:projectId/tasks/:taskId`.

<ClientOnly>
  <BenchmarkBars :data="summaryLong" unit="ops/ms" title="Long routes — all tests combined" />
</ClientOnly>

Compiled rou3 leads by 3.5x. find-my-way is second, 15% ahead of ProstoRouter; Hono and plain rou3 follow.

### Mixed Routes (20 routes)

50/50 combination of short and long routes.

<ClientOnly>
  <BenchmarkBars :data="summaryMixed" unit="ops/ms" title="Mixed routes — all tests combined" />
</ClientOnly>

Compiled rou3 and Hono's RegExpRouter are close at the top. ProstoRouter, plain rou3 and find-my-way are level, about 2x behind.

## Long Route Breakdown

A closer look at individual long-route test patterns:

<ClientOnly>
  <BenchmarkChart :data="longDetailed" mode="stacked" unit="ops/ms" title="Long routes — per-test breakdown (ops/ms)" />
</ClientOnly>

**Static lookups:** plain rou3 is the fastest on the short static path, compiled rou3 on the long one. ProstoRouter's static lookups (48–63k ops/ms) are several times faster than its parametric ones.

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
Hono's SmartRouter uses RegExpRouter while it can compile the route set, and TrieRouter otherwise. In this run it switched to TrieRouter from 100 long routes and at 198 mixed routes. Hono loses the most throughput as routes are added: 8x on short and 13x on mixed routes from the smallest to the largest set.
:::

| Router | Scaling behavior (smallest → largest route set) |
|---|---|
| **rou3 (compiled)** | Fastest at every size; drops 3.6x on short routes, 1.2x on long, 1.6x on mixed |
| **find-my-way** | Flat on long routes; drops 2–2.4x on short and mixed |
| **rou3** | Long routes noisy but flat (4.9–6.7k); drops about 3x on short and mixed |
| **ProstoRouter** | Drops 3.5x on short (mostly between 22 and 50 routes), 1.7x on long, 3.2x on mixed |
| **Hono** | Drops the most: 8x on short, 2x on long, 13x on mixed |
| **Express** | Far behind at every size |

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
