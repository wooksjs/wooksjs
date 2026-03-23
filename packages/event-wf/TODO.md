# @wooksjs/event-wf — Outlets Extension

## Context

`@wooksjs/event-wf` provides the wooks adapter for `@prostojs/wf` workflows:
`WooksWf.start()`/`resume()`, `useWfState()` composable, parent context chaining to HTTP.

`@prostojs/wf/outlets` (see `../../../prostojs/wf/TODO.md`) provides the framework-agnostic
contracts: `WfOutlet` interface, `WfStateStrategy`, step helpers (`outlet()`, `outletHttp()`,
`outletEmail()`).

This package adds the **wooks-level orchestration**: composables that interpret workflow
`inputRequired` outlet requests, call state strategies, dispatch to outlet handlers,
and set HTTP responses. These composables work in any wooks app — moost wraps them
with decorators and DI.

---

## What Changes

### New sub-export: `@wooksjs/event-wf/outlets`

```
src/
├── composables/
│   ├── wf-state.ts           (existing — untouched)
│   └── index.ts              (existing — add re-export)
├── outlets/
│   ├── index.ts              — barrel export for @wooksjs/event-wf/outlets
│   ├── outlet-context.ts     — outlet event kind + context slots
│   ├── use-wf-outlet.ts      — useWfOutlet() main composable
│   ├── use-wf-finished.ts    — useWfFinished() composable
│   ├── create-outlet.ts      — createHttpOutlet() / createEmailOutlet() factories
│   ├── trigger.ts            — handleWfOutletRequest() orchestration function
│   ├── types.ts              — config types
│   └── outlets.spec.ts       — tests
├── wf-adapter.ts             (existing — add handleOutletRequest convenience method)
└── index.ts                  (existing — untouched)
```

### package.json changes

Add sub-export + new peer deps:

```json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "require": "./dist/index.cjs",
      "import": "./dist/index.mjs"
    },
    "./outlets": {
      "types": "./dist/outlets/index.d.ts",
      "require": "./dist/outlets/index.cjs",
      "import": "./dist/outlets/index.mjs"
    }
  },
  "peerDependencies": {
    "@prostojs/wf": "^0.1.0",
    "@wooksjs/event-http": "workspace:^",
    "@wooksjs/http-body": "workspace:^"
  }
}
```

Notes:
- `@prostojs/wf` peer dep version bumps to reflect the new `/outlets` sub-export.
- `@wooksjs/event-http` is needed by the outlets sub-export only (for `useResponse()`
  which provides `setCookie()`, `setHeader()`, and for `useCookies()`, `useUrlParams()`).
- `@wooksjs/http-body` is needed for `useBody()` / `parseBody()`. The `useBody` composable
  lives in `@wooksjs/http-body`, not in `event-http`.
- The base `@wooksjs/event-wf` import does NOT require these — only
  `@wooksjs/event-wf/outlets` does.

---

## Detailed Implementation

### 1. Outlet context slots (`src/outlets/outlet-context.ts`)

Define event kind slots for outlet state within the wooks context system.
Step handlers and the trigger function share this state via composables.

```typescript
import { key } from '@wooksjs/event-core'
import type { WfOutlet, WfStateStrategy } from '@prostojs/wf/outlets'

/** Registered outlet handlers, keyed by name */
export const outletsRegistryKey = key<Map<string, WfOutlet>>('wf.outlets.registry')

/** Active state strategy for current request */
export const stateStrategyKey = key<WfStateStrategy>('wf.outlets.stateStrategy')

/** Workflow output captured by the trigger */
export const wfOutputKey = key<unknown>('wf.outlets.output')

/** Finished response set by workflow steps */
export const wfFinishedKey = key<WfFinishedResponse | undefined>('wf.outlets.finished')

export interface WfFinishedResponse {
  type: 'redirect' | 'data'
  /** Redirect URL or response body */
  value: unknown
  /** HTTP status code (default 200 for data, 302 for redirect) */
  status?: number
  /** Cookies to set */
  cookies?: Record<string, { value: string; options?: Record<string, unknown> }>
}

// Note: outlet metadata is stored in WfState.meta.outlet (see @prostojs/wf TODO.md).
// TFlowState has `meta?: Record<string, unknown>` — no wrapper type needed.
```

### 2. useWfOutlet() composable (`src/outlets/use-wf-outlet.ts`)

Access outlet context from within workflow steps. Primarily for advanced use cases
where a step needs direct access to the state strategy or outlet registry.

```typescript
import { current } from '@wooksjs/event-core'
import { outletsRegistryKey, stateStrategyKey } from './outlet-context'

/**
 * Composable for accessing outlet infrastructure from within workflow steps.
 *
 * Most steps don't need this — they just return `outletHttp(form)` or
 * `outletEmail(to, template)`. This composable is for advanced cases
 * where steps need to inspect or modify outlet state directly.
 */
export function useWfOutlet() {
  const ctx = current()
  return {
    /** The active state strategy */
    getStateStrategy: () => ctx.get(stateStrategyKey),
    /** The outlet registry (Map<name, WfOutlet>) */
    getOutlets: () => ctx.get(outletsRegistryKey),
    /** Get a specific outlet by name */
    getOutlet: (name: string) => ctx.get(outletsRegistryKey)?.get(name) ?? null,
  }
}
```

### 3. useWfFinished() composable (`src/outlets/use-wf-finished.ts`)

Set the response for when a workflow completes. Called from the last step
of a workflow to control what the HTTP response looks like.

```typescript
import { current } from '@wooksjs/event-core'
import type { WfFinishedResponse } from './outlet-context'
import { wfFinishedKey } from './outlet-context'

/**
 * Composable to set the completion response for a finished workflow.
 *
 * @example
 * ```ts
 * // Redirect after login
 * useWfFinished().set({ type: 'redirect', value: '/dashboard' })
 *
 * // Return data
 * useWfFinished().set({ type: 'data', value: { success: true } })
 * ```
 */
export function useWfFinished() {
  const ctx = current()
  return {
    set: (response: WfFinishedResponse) => ctx.set(wfFinishedKey, response),
    get: () => ctx.get(wfFinishedKey),
  }
}
```

### 4. Outlet handler factories (`src/outlets/create-outlet.ts`)

Pre-built outlet handler factories so users don't have to write boilerplate
for the common HTTP and email cases.

```typescript
import type { WfOutlet, WfOutletRequest, WfOutletResult } from '@prostojs/wf/outlets'

/**
 * Creates an HTTP outlet that passes through the outlet payload as
 * the HTTP response body. This is the most common outlet — it returns
 * forms, prompts, or data to the client.
 *
 * @example
 * ```ts
 * const httpOutlet = createHttpOutlet()
 * // Step does: return outletHttp({ fields: ['email', 'password'] })
 * // Client receives: { fields: ['email', 'password'], ...extras }
 * ```
 */
export function createHttpOutlet(opts?: {
  /** Transform the payload before returning to client */
  transform?: (payload: unknown, context?: Record<string, unknown>) => unknown
}): WfOutlet {
  return {
    name: 'http',
    async deliver(request: WfOutletRequest, token: string): Promise<WfOutletResult> {
      const body = opts?.transform
        ? opts.transform(request.payload, request.context)
        : request.payload
      return {
        response: typeof body === 'object' && body !== null
          ? { ...body, ...(request.context ?? {}) }
          : body,
      }
    },
  }
}

/**
 * Creates an email outlet that delegates to a user-provided send function.
 * The send function receives the target, template, context, and the state
 * token (for embedding in magic links / verification URLs).
 *
 * @example
 * ```ts
 * const emailOutlet = createEmailOutlet(async (opts) => {
 *   await mailer.send({
 *     to: opts.target,
 *     template: opts.template,
 *     data: { ...opts.context, verifyUrl: `/verify?wfs=${opts.token}` },
 *   })
 * })
 * ```
 */
export function createEmailOutlet(
  send: (opts: {
    target: string
    template: string
    context: Record<string, unknown>
    token: string
  }) => Promise<void>,
): WfOutlet {
  return {
    name: 'email',
    async deliver(request: WfOutletRequest, token: string): Promise<WfOutletResult> {
      await send({
        target: request.target ?? '',
        template: request.template ?? '',
        context: request.context ?? {},
        token,
      })
      // Email sent — return a minimal acknowledgement (no token in body)
      return { response: { sent: true, outlet: 'email' } }
    },
  }
}
```

### 5. Config types (`src/outlets/types.ts`)

```typescript
import type { WfOutlet, WfStateStrategy } from '@prostojs/wf/outlets'
import type { WfFinishedResponse } from './outlet-context'

export interface WfOutletTriggerConfig {
  /** Whitelist of allowed workflow IDs. If empty, all are allowed. */
  allow?: string[]
  /** Blacklist of workflow IDs. Checked after allow. */
  block?: string[]
  /** State persistence strategy */
  state: WfStateStrategy | ((wfid: string) => WfStateStrategy)
  /** Registered outlets */
  outlets: WfOutlet[]
  /** Where to read state token from incoming request */
  tokenRead?: Array<'body' | 'query' | 'cookie'>
  /** Where to write state token in response */
  tokenWrite?: 'body' | 'cookie'
  /** Parameter name for state token (default: 'wfs') */
  tokenName?: string
  /** Parameter name for workflow ID (default: 'wfid') */
  wfidName?: string
  /**
   * Initial workflow context factory. Called when starting a new workflow.
   * Receives the parsed request body so you can seed context from the request.
   * Default: `() => ({})` (empty context).
   */
  initialContext?: (body: Record<string, unknown> | undefined, wfid: string) => unknown
  /**
   * Called when a workflow finishes. If provided, its return value becomes the
   * HTTP response — overriding `useWfFinished()`. This keeps steps transport-agnostic
   * when the completion response is always the same shape.
   *
   * If not provided, falls back to `useWfFinished()` or `{ finished: true }`.
   */
  onFinished?: (ctx: { context: unknown; schemaId: string }) => unknown
  /**
   * Token consumption mode per outlet. When `true`, the trigger calls
   * `strategy.consume()` (single-use token) instead of `strategy.retrieve()`
   * on resume. Defaults to `{ email: true }` — email magic links are consumed
   * on first use, HTTP tokens are reusable.
   *
   * Can be a boolean (applies to all outlets) or a per-outlet-name map.
   */
  consumeToken?: boolean | Record<string, boolean>
}
```

### 6. handleWfOutletRequest() — the orchestration function (`src/outlets/trigger.ts`)

The core glue. A composable-style function that reads the HTTP request via wooks
composables (`useBody` from `@wooksjs/http-body`, `useUrlParams`/`useCookies`/`useResponse`
from `@wooksjs/event-http`), starts/resumes the workflow, dispatches to the outlet,
and builds the HTTP response.

Moost's `@WfOutletTrigger` decorator calls this under the hood.

```typescript
import type { TFlowOutput } from '@prostojs/wf'
import type { WfOutletRequest, WfState } from '@prostojs/wf/outlets'
import { current } from '@wooksjs/event-core'
import { useCookies, useResponse, useUrlParams } from '@wooksjs/event-http'
import { useBody } from '@wooksjs/http-body'

import {
  outletsRegistryKey,
  stateStrategyKey,
  wfFinishedKey,
} from './outlet-context'
import type { WfOutletTriggerConfig } from './types'

export interface WfOutletTriggerDeps {
  /** Start a workflow. Provided by WooksWf or MoostWf. */
  start: (schemaId: string, context: unknown, opts?: { input?: unknown; eventContext?: unknown }) =>
    Promise<TFlowOutput<unknown, unknown, WfOutletRequest>>
  /** Resume a workflow. Provided by WooksWf or MoostWf. */
  resume: (state: WfState, opts?: { input?: unknown; eventContext?: unknown }) =>
    Promise<TFlowOutput<unknown, unknown, WfOutletRequest>>
}

/**
 * Handle an HTTP request that starts or resumes a workflow.
 *
 * Reads wfs (state token) and wfid (workflow ID) from request body, query params,
 * or cookies — configurable via `tokenRead`. On workflow pause, persists state
 * and dispatches to the named outlet. On finish, returns the finished response.
 *
 * @example
 * ```ts
 * // In a wooks HTTP handler:
 * app.post('/workflow', () => handleWfOutletRequest(config, deps))
 *
 * // Better — use the WooksWf convenience method:
 * app.post('/workflow', () => wfApp.handleOutletRequest(config))
 * ```
 */
export async function handleWfOutletRequest(
  config: WfOutletTriggerConfig,
  deps: WfOutletTriggerDeps,
): Promise<unknown> {
  const tokenName = config.tokenName ?? 'wfs'
  const wfidName = config.wfidName ?? 'wfid'
  const tokenRead = config.tokenRead ?? ['body', 'query', 'cookie']
  const tokenWrite = config.tokenWrite ?? 'body'

  // 1. Initialize outlet context
  const ctx = current()
  const registry = new Map(config.outlets.map(o => [o.name, o]))
  ctx.set(outletsRegistryKey, registry)

  // 2. Read request data via wooks composables
  const { parseBody } = useBody()
  const { params } = useUrlParams()
  const { getCookie } = useCookies()
  const response = useResponse()
  const body = (await parseBody<Record<string, unknown>>().catch(() => undefined))

  // 3. Read state token from configured sources
  let token: string | undefined
  for (const source of tokenRead) {
    if (token) break
    if (source === 'body') token = body?.[tokenName] as string | undefined
    if (source === 'query') token = params().get(tokenName) ?? undefined
    if (source === 'cookie') token = getCookie(tokenName) ?? undefined
  }

  // 4. Read workflow ID (body + query only, not cookie)
  const wfid = (body?.[wfidName] as string | undefined) ?? params().get(wfidName) ?? undefined

  // 5. Read input
  const input = body?.input

  // 6. Resolve state strategy
  const resolveStrategy = (id: string) =>
    typeof config.state === 'function' ? config.state(id) : config.state

  // 7. Resolve consume mode for a given outlet name
  const shouldConsume = (outletName: string) => {
    if (typeof config.consumeToken === 'boolean') return config.consumeToken
    const defaults: Record<string, boolean> = { email: true }
    return (config.consumeToken ?? defaults)[outletName] ?? false
  }

  let output: TFlowOutput<unknown, unknown, WfOutletRequest>

  if (token) {
    // --- RESUME ---
    // We don't know schemaId yet, so use a temp strategy just to read the token.
    // For per-wfid strategies where wfid isn't in the request, we need a fallback.
    // The token itself carries the state (EncapsulatedStateStrategy) or maps to a
    // store entry (HandleStateStrategy), so any strategy instance of the same type
    // can read it. When wfid IS provided (e.g. in body), we use the correct one.
    const tempStrategy = resolveStrategy(wfid ?? '')
    ctx.set(stateStrategyKey, tempStrategy)

    // Peek at the persisted state to read outlet metadata and schemaId.
    // We use retrieve() here (non-destructive) regardless of consume mode,
    // because we need schemaId to resolve the real strategy first.
    const state = await tempStrategy.retrieve(token)
    if (!state) {
      return { error: 'Invalid or expired workflow state', status: 400 }
    }

    // Resolve the real strategy now that we know schemaId
    const strategy = resolveStrategy(state.schemaId)
    ctx.set(stateStrategyKey, strategy)

    // Check if the outlet that produced this token requires consumption (single-use).
    // The outlet name is stored in state.meta.outlet at persist time.
    const outletName = state.meta?.outlet as string | undefined
    if (outletName && shouldConsume(outletName)) {
      // Consume atomically retrieves + deletes. For EncapsulatedStateStrategy
      // this is idempotent (stateless). For HandleStateStrategy this deletes
      // the store entry so the token can't be reused (replay protection).
      await strategy.consume(token)
    }

    output = await deps.resume(state, { input, eventContext: ctx })
  } else if (wfid) {
    // --- START ---
    if (config.allow?.length && !config.allow.includes(wfid)) {
      return { error: `Workflow '${wfid}' is not allowed`, status: 403 }
    }
    if (config.block?.includes(wfid)) {
      return { error: `Workflow '${wfid}' is blocked`, status: 403 }
    }
    const strategy = resolveStrategy(wfid)
    ctx.set(stateStrategyKey, strategy)
    const initialContext = config.initialContext
      ? config.initialContext(body, wfid)
      : {}
    output = await deps.start(wfid, initialContext, { input, eventContext: ctx })
  } else {
    return { error: 'Missing wfs (state token) or wfid (workflow ID)', status: 400 }
  }

  // 8. Handle output
  if (output.finished) {
    // Check config.onFinished first (transport-agnostic completion handler)
    if (config.onFinished) {
      return config.onFinished({
        context: output.state.context,
        schemaId: output.state.schemaId,
      })
    }

    // Fall back to useWfFinished() (step-set completion response)
    const finished = ctx.get(wfFinishedKey)
    if (finished?.cookies) {
      for (const [name, cookie] of Object.entries(finished.cookies)) {
        response.setCookie(name, cookie.value, cookie.options as any)
      }
    }
    if (finished?.type === 'redirect') {
      response.setHeader('location', finished.value as string)
      return { status: finished.status ?? 302 }
    }
    if (finished) {
      return finished.value
    }
    return { finished: true }
  }

  if (output.inputRequired) {
    const outletReq = output.inputRequired
    const outletHandler = registry.get(outletReq.outlet)
    if (!outletHandler) {
      return { error: `Unknown outlet: '${outletReq.outlet}'`, status: 500 }
    }

    // Persist state with outlet name in meta so the resume path knows
    // which outlet produced this token (needed for consume vs retrieve decision)
    const strategy = ctx.get(stateStrategyKey)!
    const stateWithMeta: WfState = {
      ...(output.state as WfState),
      meta: { outlet: outletReq.outlet },
    }
    const newToken = await strategy.persist(
      stateWithMeta,
      output.expires ? { ttl: output.expires - Date.now() } : undefined,
    )

    // Write token via configured method
    if (tokenWrite === 'cookie') {
      response.setCookie(tokenName, newToken, { httpOnly: true, sameSite: 'strict', path: '/' })
    }

    // Deliver via outlet
    const result = await outletHandler.deliver(outletReq, newToken)

    // If body-based token writing, merge token into response
    if (tokenWrite === 'body' && result?.response && typeof result.response === 'object') {
      return { ...result.response, [tokenName]: newToken }
    }

    return result?.response ?? { waiting: true }
  }

  if (output.error) {
    return { error: output.error.message, errorList: output.errorList }
  }

  return { error: 'Unexpected workflow state' }
}
```

### 7. WooksWf convenience method (`src/wf-adapter.ts` — addition)

Eliminate the `deps` boilerplate for plain wooks users. Add to the existing
`WooksWf` class:

```typescript
/**
 * Convenience method that wires `this.start` and `this.resume` into
 * `handleWfOutletRequest()` so the caller only provides config.
 *
 * @example
 * ```ts
 * httpApp.post('/workflow', () => wfApp.handleOutletRequest(config))
 * ```
 */
public handleOutletRequest(config: WfOutletTriggerConfig): Promise<unknown> {
  return handleWfOutletRequest(config, {
    start: (schemaId, context, opts) =>
      this.start(schemaId, context as T, opts),
    resume: (state, opts) =>
      this.resume(state as { schemaId: string; indexes: number[]; context: T }, opts),
  })
}
```

Note: `handleWfOutletRequest` is imported from `./outlets/trigger`. This creates
a dependency from the main entry point on the outlets sub-export code. To avoid
that, this method should be added only if the outlets code is available. Two options:

**Option A (recommended):** Keep `handleOutletRequest` on `WooksWf` and import
from `./outlets/trigger`. The outlets code is tree-shakeable — bundlers drop it
if the method is never called. The import only pulls in types + the function.

**Option B:** Export a standalone helper from the outlets barrel:

```typescript
// In @wooksjs/event-wf/outlets
export function createOutletHandler(wfApp: WooksWf) {
  return (config: WfOutletTriggerConfig) =>
    handleWfOutletRequest(config, {
      start: (schemaId, context, opts) => wfApp.start(schemaId, context, opts),
      resume: (state, opts) => wfApp.resume(state, opts),
    })
}
```

Go with **Option B** to keep the main entry point clean and avoid importing
outlet code into the base package.

### 8. Barrel export (`src/outlets/index.ts`)

```typescript
export { useWfOutlet } from './use-wf-outlet'
export { useWfFinished } from './use-wf-finished'
export type { WfFinishedResponse } from './outlet-context'
export { handleWfOutletRequest } from './trigger'
export type { WfOutletTriggerConfig, WfOutletTriggerDeps } from './types'
export { createHttpOutlet, createEmailOutlet } from './create-outlet'
export { createOutletHandler } from './create-handler'

// Re-export prostojs/wf/outlets for convenience
export {
  outlet,
  outletHttp,
  outletEmail,
  type WfOutlet,
  type WfOutletRequest,
  type WfOutletResult,
  type WfStateStrategy,
  type WfStateStore,
  type WfState,
  EncapsulatedStateStrategy,
  HandleStateStrategy,
  WfStateStoreMemory,
} from '@prostojs/wf/outlets'
```

---

## Tests (`src/outlets/outlets.spec.ts`)

### useWfFinished()
- `set()` stores response in context
- `get()` returns stored response
- `get()` returns undefined when nothing set

### useWfOutlet()
- `getOutlet('http')` returns registered outlet
- `getOutlet('unknown')` returns null
- `getStateStrategy()` returns the active strategy

### createHttpOutlet()
- `deliver()` returns payload as response body
- `deliver()` merges context into response
- Custom `transform` function is applied

### createEmailOutlet()
- `deliver()` calls send function with target, template, context, token
- `deliver()` returns `{ sent: true, outlet: 'email' }`

### handleWfOutletRequest()
- **Start workflow (happy path):** sends `{ wfid }`, workflow runs to completion,
  returns finished response
- **Start with initialContext:** `initialContext(body, wfid)` seeds workflow context
  from request body
- **Start workflow → pause (HTTP outlet):** workflow pauses with `outletHttp(form)`,
  trigger calls `strategy.persist()`, calls `httpOutlet.deliver()`, returns form + token
- **Resume workflow:** sends `{ wfs: token }`, `strategy.retrieve()` returns state,
  workflow resumes, returns result
- **Resume with expired token:** `strategy.retrieve()` returns null → 400 error
- **Start with disallowed wfid:** returns 403
- **Start with blocked wfid:** returns 403
- **Missing both wfs and wfid:** returns 400
- **Unknown outlet name:** workflow pauses with unknown outlet → 500 error
- **Finished with onFinished callback:** `onFinished` return value becomes response,
  `useWfFinished()` is ignored
- **Finished with redirect (useWfFinished):** `useWfFinished().set({ type: 'redirect', value: '/home' })`
  → 302 response with location header
- **Finished with data (useWfFinished):** `useWfFinished().set({ type: 'data', value: { ok: true } })`
  → 200 response with body
- **Per-workflow state strategy:** `state: (wfid) => ...` selects correct strategy
- **consumeToken per outlet:** email outlet calls `consume()` on resume (token
  invalidated), HTTP outlet calls `retrieve()` (token reusable)
- **consumeToken — replay protection:** resume with consumed email token a second
  time → `retrieve()` returns null → 400 error
- **meta.outlet round-trip:** persisted state includes `meta: { outlet }`, resume
  path reads it to decide consume vs retrieve

### createOutletHandler()
- Creates a handler that wires WooksWf start/resume automatically
- Handler calls handleWfOutletRequest with correct deps

### Integration test
- Full round-trip: start workflow → HTTP outlet pauses with form → extract token →
  resume with token + input → workflow completes → finished response
- Uses `WfStateStoreMemory` + `HandleStateStrategy` for realistic state persistence
- Uses `createHttpOutlet()` (not a manual mock)

---

## How moost wraps this

`@moostjs/wf-outlets` (separate package in moostjs monorepo) provides:

```typescript
// Decorator that calls handleWfOutletRequest() inside a moost interceptor
@WfOutletTrigger({
  allow: ['auth/login'],
  state: injectedStrategy,     // from DI
  outlets: [httpOutlet, emailOutlet],
})

// Decorators for step metadata
@StepTTL(60000)        // sets output.expires
@OutletConsume          // marks step for token consumption on resume
```

The moost layer is thin — it resolves DI, reads decorator metadata, and calls
`handleWfOutletRequest()` from this package.

---

## Checklist

- [ ] Create `src/outlets/` directory with all files
- [ ] Implement outlet context slots
- [ ] Implement `useWfOutlet()` composable
- [ ] Implement `useWfFinished()` composable
- [ ] Implement `createHttpOutlet()` and `createEmailOutlet()` factories
- [ ] Implement `createOutletHandler()` convenience wrapper
- [ ] Implement `handleWfOutletRequest()` orchestration function
- [ ] Implement types (with `initialContext`, `onFinished`, `consumeToken`)
- [ ] Write tests (composables + factories + trigger orchestration + integration)
- [ ] Update `package.json` exports to include `./outlets` sub-path
- [ ] Add `@wooksjs/event-http` and `@wooksjs/http-body` as peer deps
- [ ] Update build config for sub-export
- [ ] All existing tests still pass
- [ ] New tests pass
- [ ] Build produces correct output for both entry points
