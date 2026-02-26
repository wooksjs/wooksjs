# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Test Commands

```bash
# Build all packages (types + rolldown bundles)
pnpm build

# Build a single package
pnpm build event-http

# Run all tests
pnpm test

# Run a single test file
pnpm vitest run packages/event-http/src/composables/tests/headers.spec.ts

# Watch mode
pnpm test:watch

# Lint & format
pnpm lint          # oxlint
pnpm format        # oxfmt (apply)
pnpm format:check  # oxfmt (check only)
```

## Monorepo Structure

pnpm workspaces. All packages live in `packages/`:

| Package       | Role                                                                                |
| ------------- | ----------------------------------------------------------------------------------- |
| `event-core`  | Foundation — EventContext, AsyncLocalStorage, `defineWook`, `cached`, `slot`, `key` |
| `wooks`       | Router integration — re-exports core + `@prostojs/router`                           |
| `event-http`  | HTTP adapter — composables for request/response/cookies/auth/accept                 |
| `event-cli`   | CLI adapter                                                                         |
| `event-ws`    | WebSocket adapter — path-based routing, rooms, broadcasting                         |
| `event-wf`    | Workflow adapter (via `@prostojs/wf`)                                               |
| `http-body`   | Body parsing (JSON, form-data, urlencoded) — separate from event-http               |
| `http-static` | Static file serving                                                                 |
| `http-proxy`  | Reverse proxy                                                                       |
| `ws-client`   | WebSocket client (browser + Node)                                                   |

**Dependency chain:** `event-core` ← `wooks` ← adapters (`event-http`, `event-cli`, `event-ws`, `event-wf`) ← utilities (`http-body`, `http-static`, `http-proxy`).

## Architecture

### EventContext + AsyncLocalStorage

Every request/event gets an `EventContext` — a typed slot container propagated via Node's `AsyncLocalStorage`. Composables call `current()` to get the context without parameter passing. The storage is a global singleton via `Symbol.for('wooks.core.asyncStorage')`.

### Composable Pattern (`defineWook`)

All public API is accessed through composable functions. `defineWook(factory)` creates a per-context cached composable:

```ts
export const useFoo = defineWook((ctx: EventContext) => ({
  bar: () => ctx.get(someSlot),
}))
```

### Slot System

- `key<T>(name)` — simple typed slot
- `cached(factory)` — lazy-computed, cached per context
- `cachedBy(factory)` — lazy-computed, keyed by first argument
- `slot<T>()` — schema marker for `defineEventKind`

### EventKind

Each adapter declares its slots via `defineEventKind(name, schema)`, e.g. `httpKind` seeds `req`, `response`, `requestLimits`, `routeParams`.

### Parent Context Chain

Child contexts (e.g. workflow steps inheriting HTTP context) traverse the parent chain for slot lookups. This enables composables to work transparently across boundaries.

## Build System

`scripts/build.js` uses Rolldown (not a config file — it's programmatic). Each package produces `dist/index.mjs`, `dist/index.cjs`, and `dist/index.d.ts`. Types are generated via `tsc` → consolidated via `rollup-plugin-dts`.

## Composable API Reference (current names)

| Composable           | Key Properties                                                               |
| -------------------- | ---------------------------------------------------------------------------- |
| `useRequest()`       | `raw`, `url`, `method`, `headers`, `rawBody()`, `getIp()`, `reqId()`         |
| `useUrlParams()`     | `params()`, `toJson()`, `raw()`                                              |
| `useCookies()`       | `getCookie(name)`, `raw`                                                     |
| `useAuthorization()` | `authorization`, `type()`, `credentials()`, `is(type)`, `basicCredentials()` |
| `useAccept()`        | `accept`, `has(type)`                                                        |
| `useBody()`          | `is(type)`, `parseBody<T>()`, `rawBody()`                                    |
| `useResponse()`      | Returns `HttpResponse` instance directly                                     |

## AI Agent Skills

Packages include `skills/` directories with progressive-disclosure documentation for AI agents. Setup scripts (`scripts/setup-skills.js`) copy skill files to consuming projects.

## Release

`pnpm release` — builds, lints, tests, syncs versions across all packages, publishes to npm. Versions are kept in sync via `scripts/versions.js`. Uses conventional commits with commitlint.
