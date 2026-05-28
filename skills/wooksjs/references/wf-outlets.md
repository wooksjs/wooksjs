# @wooksjs/event-wf -- Outlets

For workflow core (steps, flows, schema), see [event-wf.md](event-wf.md). For parent context, spies, error handling, see [wf-advanced.md](wf-advanced.md).

## Contents

- [Core Concepts](#core-concepts)
- [Outlet Signal Helpers](#outlet-signal-helpers) — `outlet`, `outletHttp`, `outletEmail`
- [WfOutletRequest](#wfoutletrequest)
- [Creating Outlets](#creating-outlets) — `createHttpOutlet`, `createEmailOutlet`, custom outlets (`tokenDelivery`)
- [State Strategies](#state-strategies) — `HandleStateStrategy` vs `EncapsulatedStateStrategy`, `WfStateStore`
- [Trigger Handler](#trigger-handler) — `createOutletHandler`, `handleWfOutletRequest`
- [WfOutletTriggerConfig](#wfoutlettriggerconfig)
- [WfOutletTokenConfig](#wfoutlettokenconfig)
- [Trigger Request Flow](#trigger-request-flow) — consume semantics, fail-closed behavior
- [useWfFinished](#usewffinished-composable)
- [useWfOutlet](#usewfoutlet-composable)
- [Full Round-Trip Example](#full-outlet-round-trip-example)

## Core Concepts

Outlets are delivery channels for pause/resume interactions. When a workflow step needs external
input, it signals an outlet (HTTP response, email, etc.) that delivers a request to the user and
later receives the response to resume the workflow.

- **Outlet signal** -- a step returns `outletHttp(payload)` or `outletEmail(target, template)` to
  pause the workflow and trigger delivery through the named outlet.
- **State strategy** -- persists workflow state between pause and resume (encrypted token or
  server-side handle).
- **Trigger handler** -- an HTTP endpoint handler that starts/resumes workflows and dispatches to
  outlets.

---

## Outlet Signal Helpers

Imported from `@wooksjs/event-wf` (re-exported from `@prostojs/wf/outlets`):

```ts
// Generic outlet signal
function outlet<P = unknown>(
  name: string,
  data?: Omit<WfOutletRequest<P>, 'outlet'>,
): WfOutletSignal<P>

// HTTP outlet -- returns payload as HTTP response body
function outletHttp<P = unknown>(
  payload: P,
  context?: Record<string, unknown>,
): WfOutletSignal<P>

// Email outlet -- sends email via configured send function
function outletEmail(
  target: string,
  template: string,
  context?: Record<string, unknown>,
): WfOutletSignal<unknown>
```

Use inside step handlers:

```ts
app.step('ask-input', {
  handler: () => {
    const { input } = useWfState()
    if (input()) return            // already have input, continue
    return outletHttp({ fields: ['email', 'password'] })
  },
})

app.step('send-verify', {
  handler: () => {
    const { input } = useWfState()
    if (input()) return
    return outletEmail('user@example.com', 'verify')
  },
})
```

---

## WfOutletRequest

```ts
interface WfOutletRequest<P = unknown> {
  outlet: string                    // outlet name ('http', 'email', custom)
  payload?: P                       // data for the outlet
  target?: string                   // recipient (email address, etc.)
  template?: string                 // template identifier
  context?: Record<string, unknown> // extra context passed to outlet
}
```

---

## Creating Outlets

### HTTP outlet

Passes the outlet payload as the HTTP response body:

```ts
import { createHttpOutlet } from '@wooksjs/event-wf'

const httpOutlet = createHttpOutlet()

// With custom transform
const httpOutlet = createHttpOutlet({
  transform: (payload, context) => ({ ...payload, ...context, transformed: true }),
})
```

### Email outlet

Delegates to a user-provided send function:

```ts
import { createEmailOutlet } from '@wooksjs/event-wf'

const emailOutlet = createEmailOutlet(async (opts) => {
  await mailer.send({
    to: opts.target,
    template: opts.template,
    data: { ...opts.context, verifyUrl: `/verify?wfs=${opts.token}` },
  })
})
```

The send function receives `{ target, template, context, token }`.

### Custom outlets — `tokenDelivery`

Implement the `WfOutlet` interface for custom delivery channels (SMS, Slack, webhook, pending-task queue, etc.). The `tokenDelivery` field is security-critical:

```ts
import type { WfOutlet } from '@wooksjs/event-wf'

const slackOutlet: WfOutlet = {
  name: 'slack',
  tokenDelivery: 'out-of-band',  // resumer is a Slack user, not the HTTP caller
  async deliver(request, token) {
    await slack.postMessage(request.target!, {
      actions: [{ url: `https://app.com/resume?wfs=${token}` }],
    })
    return { response: { sent: true } }
  },
}
```

**`tokenDelivery: 'caller'` (default)** — HTTP caller is the resumer; trigger merges token into body/cookie.

**`tokenDelivery: 'out-of-band'`** — outlet delivers the token through its own channel (recipient ≠ HTTP caller); trigger suppresses body merge and cookie write so the caller receives no token.

Built-in outlets: `createHttpOutlet()` = `'caller'`, `createEmailOutlet()` = `'out-of-band'`.

Any custom outlet whose resumer is a different principal than the HTTP caller MUST declare `'out-of-band'`, otherwise the caller receives a token they shouldn't have — a privilege escalation vector.

---

## State Strategies

Persist workflow state between pause and resume.

```ts
interface WfStateStrategy {
  persist(
    state: WfState,
    options?: { ttl?: number },
    overrides?: { handle?: string },                        // hint to reuse a handle
  ): Promise<string>
  retrieve(token: string): Promise<WfState | null>          // NO invalidation
  consume(token: string): Promise<WfState | null>           // atomic retrieve + invalidate
}
```

The outlet trigger calls `consume()` on every resume as a brief mutex against concurrent resumes, then re-persists with `{ handle: token }` so the URL `wfs` stays stable across the entire workflow. `HandleStateStrategy` honors the handle hint and reuses the same storage key. `EncapsulatedStateStrategy` ignores it (the token IS the ciphertext) and mints a fresh token on every persist anyway. See the security warning below.

### HandleStateStrategy

Stores state server-side with an opaque handle token. The handle is **minted on workflow start and reused on every resume** (the outlet trigger passes `{ handle: token }` to `persist()`), so the URL token survives refreshes, bookmarks, and lost-connection-then-resume across the entire workflow. **Required for security-sensitive flows** (auth, password reset, invite accept, financial operations) — and for any flow where the resume URL must remain stable across user actions.

```ts
import { HandleStateStrategy, WfStateStoreMemory } from '@wooksjs/event-wf'

const strategy = new HandleStateStrategy({
  store: new WfStateStoreMemory(),  // or custom WfStateStore implementation
  defaultTtl: 3600_000,
  generateHandle: () => crypto.randomUUID(), // optional
})
```

### EncapsulatedStateStrategy

Encrypts state into the token itself (no server-side storage). **Stateless — `consume()` is a no-op alias for `retrieve()`, so a copy of the token remains valid for the full TTL.** The `{ handle }` hint from the engine is silently ignored: the ciphertext is a function of the (advanced) state, so the returned token differs from the consumed token on every resume that mutates state. Use only for idempotent, non-sensitive flows.

```ts
import { EncapsulatedStateStrategy } from '@wooksjs/event-wf'

const strategy = new EncapsulatedStateStrategy({
  secret: process.env.WF_SECRET,  // string | Buffer (32 bytes)
  defaultTtl: 3600_000,           // optional, ms
})
```

**Selection rule.** If the flow has any real-world side effect (auth, credentials, money, permissions), use `HandleStateStrategy`. Use `EncapsulatedStateStrategy` only when every step is idempotent and replay-within-TTL is harmless.

### WfStateStore interface

Implement for custom persistence (Redis, database, etc.):

```ts
interface WfStateStore {
  set(handle: string, state: WfState, expiresAt?: number): Promise<void>
  get(handle: string): Promise<{ state: WfState; expiresAt?: number } | null>
  delete(handle: string): Promise<void>
  getAndDelete(handle: string): Promise<{ state: WfState; expiresAt?: number } | null>
  cleanup?(): Promise<number>
}
```

`WfStateStoreMemory` is an in-memory implementation for development/testing.

---

## Trigger Handler

The trigger handler is an HTTP endpoint that starts or resumes workflows.

### `createOutletHandler(wfApp)`

Create a pre-wired handler from a workflow app:

```ts
import { createOutletHandler } from '@wooksjs/event-wf'

const handle = createOutletHandler(wfApp)
httpApp.post('/workflow', () => handle(config))
```

### `handleWfOutletRequest(config, deps)`

Lower-level function -- use `createOutletHandler` instead unless wiring manually:

```ts
import { handleWfOutletRequest } from '@wooksjs/event-wf'

httpApp.post('/workflow', () => handleWfOutletRequest(config, {
  start: (schemaId, context, opts) => wfApp.start(schemaId, context, opts),
  resume: (state, opts) => wfApp.resume(state, opts),
}))
```

---

## WfOutletTriggerConfig

```ts
interface WfOutletTriggerConfig {
  /**
   * State persistence strategy.
   *
   * - `WfStateStrategy` — single-strategy shortcut.
   * - `{ strategies, default }` — named registry, required if any step calls
   *   `swapStrategy(name)`. `default` is the name (or `(wfid) => name`)
   *   picked at start time.
   *
   * The active strategy name is embedded in the token as a `<name>.<raw>`
   * prefix, so storages are independent and resume picks the strategy from
   * the token. Strategy names must match `/^[A-Za-z0-9_-]+$/`.
   */
  state:
    | WfStateStrategy
    | {
        strategies: Record<string, WfStateStrategy>
        default: string | ((wfid: string) => string)
      }
  outlets: WfOutlet[]
  allow?: string[]              // whitelist of allowed workflow IDs
  block?: string[]              // blacklist (checked after allow)
  token?: WfOutletTokenConfig
  wfidName?: string             // param name for workflow ID (default: 'wfid')
  initialContext?: (body: Record<string, unknown> | undefined, wfid: string) => unknown
  onFinished?: (ctx: { context: unknown; schemaId: string }) => unknown
}
```

### Swapping strategies inside a step

```ts
import { swapStrategy, useWfStrategy } from '@wooksjs/event-wf'

// Switch the strategy for the next persist. Sticky across resumes because
// the new name is embedded in the issued token prefix.
swapStrategy('kv')

// Or via composable:
useWfStrategy().swap('kv')
useWfStrategy().current()      // → currently-active strategy name
```

- Unknown name → throws synchronously (config / step author bug).
- Token whose prefix names an unknown strategy → HTTP 410 (no leak of registered names).
- Token without a `.` prefix → HTTP 410.
- After a swap, the next persist mints a fresh handle in the new strategy's keyspace; before any swap, the trigger reuses the incoming raw handle so `wfs` stays stable across the workflow.

---

## WfOutletTokenConfig

Controls how state tokens are read from requests and written to responses. The trigger consumes on every resume (as a brief mutex) and re-persists under the same handle so the `wfs` stays stable across the workflow. For out-of-band outlets (email, SMS, etc.), the token is NOT written to the HTTP response (body or cookie is suppressed) so the HTTP caller cannot replay it; this is controlled by the outlet's `tokenDelivery` field, not this config.

```ts
interface WfOutletTokenConfig {
  read?: Array<'body' | 'query' | 'cookie'>   // default: ['body', 'query', 'cookie']
  write?: 'body' | 'cookie'                   // default: 'body'
  name?: string                                // token param name (default: 'wfs')
}
```

---

## Trigger Request Flow

The trigger reads `wfs` (state token) and `wfid` (workflow ID) from body, query params, or cookies per `token.read` config.

- If `wfs` is present: **resume** — the trigger calls `strategy.consume(token)` (atomic retrieve + invalidate) BEFORE running the step, then re-persists the advanced state under the **same** handle so the URL token stays valid. A request that loses the race against a concurrent resume — or any request after the workflow finished or an unexpected error burned the handle — responds with HTTP **410 Gone** and body `{ error: 'Invalid or expired workflow state' }`. With `EncapsulatedStateStrategy` `consume()` is a stateless no-op and the token remains replayable until TTL.
- If `wfid` is present (no `wfs`): **start** — creates initial context, starts workflow.
- If neither: HTTP **400** with body `{ error: '...' }`.

The trigger sets HTTP status via `useResponse().setStatus(...)`; the body never carries a `status` field. Status mapping for error branches:

| Condition                            | Status |
| ------------------------------------ | ------ |
| Expired/invalid resume token          | 410    |
| `wfid` not in `allow`                 | 403    |
| `wfid` in `block`                     | 403    |
| Missing both `wfs` and `wfid`         | 400    |
| Step returned an unknown outlet name  | 500    |

For finished workflows, `useWfFinished().set({ type, value, status })` propagates `status` to the HTTP response: redirects default to 302, data responses leave the status untouched (HTTP method default) unless `status` is set explicitly.

On pause (initial or re-pause), the trigger persists state, dispatches to the outlet, and returns the outlet's response. With `HandleStateStrategy` the persisted handle equals the incoming `wfs` on resume (or a freshly minted UUID on start); with `EncapsulatedStateStrategy` the token always changes because the ciphertext is a function of the new state. The token is merged into the response (body or cookie per `token.write`) only if the outlet declares `tokenDelivery: 'caller'` (the default for HTTP outlets). For `tokenDelivery: 'out-of-band'` outlets (email, SMS, etc.), the response does NOT contain the token — the outlet delivers it through its own channel.

On finish, the trigger checks `onFinished` callback, then `useWfFinished()`, then returns `{ finished: true }`. The handle is not re-persisted, so it remains deleted from the consume call earlier in the request.

**Fail-closed on unexpected errors.** A consumed handle is restored only after the step returns. An unexpected throw during resume skips the re-persist call — the handle is gone and the user must restart the workflow. This is the security-preferred behavior (no lingering replayable token after a failed attempt). Handle expected validation failures by returning an outlet signal from the step handler (the engine re-persists under the same handle on the re-pause), not by throwing.

**Strategy divergence guard.** When the persisted `state.schemaId` disagrees with the request `wfid` and the per-`wfid` strategy factory returns a *different strategy reference*, the engine skips the handle-reuse optimization and mints a fresh token (the original handle belongs to the provisional strategy's keyspace, not the real strategy's). When the factory returns the same strategy for both ids, reuse proceeds.

---

## useWfFinished composable

Set the completion response from within a workflow step:

```ts
import { useWfFinished } from '@wooksjs/event-wf'

// Redirect after completion
app.step('complete-login', {
  handler: () => {
    useWfFinished().set({ type: 'redirect', value: '/dashboard' })
  },
})

// Return data
app.step('complete-signup', {
  handler: () => {
    useWfFinished().set({
      type: 'data',
      value: { success: true, userId: '123' },
    })
  },
})
```

```ts
interface WfFinishedResponse {
  type: 'redirect' | 'data'
  value: unknown                // redirect URL or response body
  status?: number               // HTTP status (default: 200 for data, 302 for redirect)
  cookies?: Record<string, {
    value: string
    options?: Record<string, unknown>
  }>
}
```

---

## useWfOutlet composable

Advanced composable for inspecting outlet infrastructure from within steps:

```ts
import { useWfOutlet } from '@wooksjs/event-wf'

const { getOutlets, getOutlet } = useWfOutlet()
getOutlet('http')          // WfOutlet | null
getOutlets()               // Map<string, WfOutlet>
```

---

## Full outlet round-trip example

```ts
import { createWfApp, createOutletHandler, createHttpOutlet, createEmailOutlet,
         outletHttp, outletEmail, useWfState, useWfFinished,
         HandleStateStrategy, WfStateStoreMemory } from '@wooksjs/event-wf'
import { createHttpApp } from '@wooksjs/event-http'

const wf = createWfApp<{ email?: string; verified?: boolean }>()

wf.step('ask-email', {
  handler: () => {
    const { input } = useWfState()
    if (input()) {
      useWfState().ctx<{ email?: string }>().email = input<string>()
      return
    }
    return outletHttp({ prompt: 'Enter your email', fields: ['email'] })
  },
})

wf.step('send-verify', {
  handler: () => {
    const { input, ctx } = useWfState()
    if (input()) {
      ctx<{ verified?: boolean }>().verified = true
      return
    }
    return outletEmail(ctx<{ email?: string }>().email!, 'verify-email')
  },
})

wf.step('done', {
  handler: () => {
    useWfFinished().set({ type: 'data', value: { success: true } })
  },
})

wf.flow('signup', ['ask-email', 'send-verify', 'done'])

const http = createHttpApp()
const handle = createOutletHandler(wf)

const store = new WfStateStoreMemory()
const strategy = new HandleStateStrategy({ store })

http.post('/signup', () => handle({
  state: strategy,
  outlets: [
    createHttpOutlet(),
    createEmailOutlet(async ({ target, template, context, token }) => {
      await sendMail(target, template, { ...context, verifyUrl: `/signup?wfs=${token}` })
    }),
  ],
}))
```
