# Outlets

Outlets let workflows **pause and deliver a request to the outside world** — render an HTTP form, send an email with a magic link, or dispatch to any custom delivery channel. When the user responds (submits the form, clicks the link), the workflow **resumes** automatically.

The outlet system handles state persistence, token generation, atomic `consume()` on every resume (as a short mutex against concurrent resumes), re-persisting under the **same handle** so the `wfs` token stays stable across the entire workflow run, and HTTP response building — so your step handlers stay declarative.

[[toc]]

## Overview

The flow looks like this:

1. A step returns `outletHttp(form)` or `outletEmail(to, template)` — the workflow pauses
2. The trigger function persists the state, generates a token, and dispatches to the outlet handler
3. The outlet handler delivers the response (HTTP body, email with magic link, etc.)
4. The client/user responds with the token + input
5. The trigger reads the token, restores state, and resumes the workflow

All of this is handled by `handleWfOutletRequest()` — a single function you wire to an HTTP endpoint.

## Quick Start

```ts
import { createHttpApp } from '@wooksjs/event-http'
import {
  createWfApp,
  useWfState,
  createHttpOutlet,
  createOutletHandler,
  outletHttp,
  HandleStateStrategy,
  WfStateStoreMemory,
} from '@wooksjs/event-wf'

// 1. Create workflow app
const wf = createWfApp<{ email?: string; verified?: boolean }>()

// 2. Define steps
wf.step('ask-email', {
  handler: () => {
    const { input } = useWfState()
    if (input()) return                    // already provided on resume
    return outletHttp({ fields: ['email'] }) // pause and ask client
  },
})

wf.step('save', {
  handler: () => {
    const { ctx, input } = useWfState()
    const data = input<{ email: string }>()
    if (data) ctx<{ email?: string }>().email = data.email
  },
})

wf.flow('signup', ['ask-email', 'save'])

// 3. Wire outlet handler to HTTP
const http = createHttpApp()
const handle = createOutletHandler(wf)

http.post('/signup', () =>
  handle({
    state: new HandleStateStrategy({ store: new WfStateStoreMemory() }),
    outlets: [createHttpOutlet()],
  })
)

http.listen(3000)
```

**Client flow:**

```
POST /signup  { wfid: "signup" }
← { fields: ["email"], wfs: "abc123" }

POST /signup  { wfs: "abc123", input: { email: "user@example.com" } }
← { finished: true }
```

## Step Helpers

These helpers are re-exported from `@prostojs/wf/outlets` for convenience:

### `outletHttp(payload, context?)`

Pause the workflow and return a form/prompt to the HTTP client:

```ts
wf.step('login', {
  handler: () => {
    const { input } = useWfState()
    if (input()) return
    return outletHttp(
      { fields: ['username', 'password'] },
      { error: 'Invalid credentials' },  // optional context
    )
  },
})
```

### `outletEmail(target, template, context?)`

Pause and send an email (e.g. verification link, approval request):

```ts
wf.step('verify-email', {
  handler: () => {
    const { input } = useWfState()
    if (input()) return
    return outletEmail('user@example.com', 'verify-template', {
      name: 'Alice',
    })
  },
})
```

### `outlet(name, data?)`

Generic outlet for custom delivery channels:

```ts
return outlet('sms', { payload: { phone: '+1234567890' } })
```

## Outlet Handlers

Outlet handlers implement the `WfOutlet` interface — they receive the pause request and a state token, and return the response.

### `createHttpOutlet(opts?)`

Built-in factory for HTTP outlets. Passes the step's payload through as the response body:

```ts
import { createHttpOutlet } from '@wooksjs/event-wf'

const httpOutlet = createHttpOutlet()

// With custom transform:
const httpOutlet = createHttpOutlet({
  transform: (payload, context) => ({
    type: 'form',
    ...payload,
    ...context,
  }),
})
```

### `createEmailOutlet(sendFn)`

Built-in factory for email outlets. Delegates to your email-sending function:

```ts
import { createEmailOutlet } from '@wooksjs/event-wf'

const emailOutlet = createEmailOutlet(async ({ target, template, context, token }) => {
  await mailer.send({
    to: target,
    template,
    data: {
      ...context,
      verifyUrl: `https://example.com/signup?wfs=${token}`,
    },
  })
})
```

### Custom Outlets

Implement the `WfOutlet` interface directly:

```ts
import type { WfOutlet } from '@wooksjs/event-wf'

const smsOutlet: WfOutlet = {
  name: 'sms',
  tokenDelivery: 'out-of-band',  // SMS recipient is not the HTTP caller
  async deliver(request, token) {
    await smsService.send(request.target!, `Your code: ${token}`)
    return { response: { sent: true } }
  },
}
```

#### `tokenDelivery`

Declares how the resumption token reaches the resumer. This is a **security-critical** field — get it wrong and the HTTP caller who triggered the pause will receive the token intended for a different principal.

- `'caller'` (default) — the HTTP caller IS the resumer. The trigger merges the token into the HTTP response body or `Set-Cookie` per `token.write`. Appropriate for multi-step HTTP forms.
- `'out-of-band'` — the outlet delivers the token through its own channel (email, SMS, Slack message, webhook). The HTTP caller is a bystander. The trigger suppresses body merge and cookie write so the caller receives no token.

Built-in outlets: `createHttpOutlet()` declares `'caller'`; `createEmailOutlet()` declares `'out-of-band'`. Any custom outlet whose resumer is a different principal than the HTTP caller MUST declare `'out-of-band'`.

## Configuration

The `handleWfOutletRequest` function (or the handler returned by `createOutletHandler`) accepts a `WfOutletTriggerConfig`:

```ts
interface WfOutletTriggerConfig {
  /**
   * State persistence strategy.
   *
   * - Single-strategy shortcut: pass a `WfStateStrategy` directly.
   * - Named registry: pass `{ strategies, default }` to enable per-step
   *   `swapStrategy(name)` calls (see "Swapping strategies" below).
   *
   * The active strategy name is embedded in the issued token as a
   * `<name>.<rawToken>` prefix, so each strategy's storage is independent —
   * resume picks the strategy from the token itself.
   *
   * Strategy names must match `/^[A-Za-z0-9_-]+$/`.
   */
  state:
    | WfStateStrategy
    | {
        strategies: Record<string, WfStateStrategy>
        default: string | ((wfid: string) => string)
      }
  outlets: WfOutlet[]
  token?: {
    name?: string                              // default: 'wfs'
    read?: Array<'body' | 'query' | 'cookie'>  // default: ['body', 'query', 'cookie']
    write?: 'body' | 'cookie'                  // default: 'body'
  }
  wfidName?: string                            // default: 'wfid'
  allow?: string[]
  block?: string[]
  initialContext?: (body, wfid) => unknown
  onFinished?: (ctx: { context, schemaId }) => unknown
}
```

### Swapping strategies

A workflow step can switch which strategy persists the **next** outlet pause by
calling `swapStrategy(name)`. The change is sticky for the rest of the
workflow because the new name travels with the token prefix.

```ts
import { swapStrategy, outletHttp } from '@wooksjs/event-wf'

app.step('escalate-storage', {
  handler: (ctx) => {
    if (ctx.payloadIsLarge) swapStrategy('kv')  // escalate to durable storage
    return outletHttp({ fields: ['decision'] })
  },
})
```

The trigger config must use the named-registry form for `swapStrategy` to
resolve names:

```ts
{
  strategies: {
    enc: new EncapsulatedStateStrategy({ secret }),
    kv:  new HandleStateStrategy({ store }),
  },
  default: 'enc',
}
```

Unknown names throw at the call site (config bug). Tokens whose prefix names
an unknown strategy return HTTP 410 (same as any invalid token — the trigger
does not leak which strategies are registered).

### State Strategies

State strategies control how workflow state is persisted between pause and resume. **Choose based on whether the workflow is security-sensitive** — see the security note below.

**`HandleStateStrategy`** — server-side storage with a short opaque handle as token. Supports truly single-use tokens via atomic `getAndDelete` at the store layer. **Use this for any flow with real-world side effects** (auth, password reset, invite accept, financial operations).

```ts
import { HandleStateStrategy, WfStateStoreMemory } from '@wooksjs/event-wf'

const strategy = new HandleStateStrategy({
  store: new WfStateStoreMemory(),  // in-memory (dev/test only)
  defaultTtl: 60_000,              // 1 minute expiry
})
```

For production, implement the `WfStateStore` interface backed by Redis, a database, etc.

**`EncapsulatedStateStrategy`** — stateless, AES-256-GCM encrypted token. No server storage needed. The entire workflow state is encrypted into the token itself. **Use only for idempotent, non-sensitive flows** (multi-step forms, pure data collection).

```ts
import { EncapsulatedStateStrategy } from '@wooksjs/event-wf'

const strategy = new EncapsulatedStateStrategy({
  secret: crypto.randomBytes(32),  // 32-byte AES-256 key
  defaultTtl: 300_000,             // 5 minutes
})
```

#### Security note — token replay and session stability

The `wfs` token is a **workflow session credential**, not a per-step single-use token. It is minted on start, reused on every resume, and dies when the workflow finishes (or when an unexpected error burns the handle before the engine can re-persist).

What this means in practice:

- The same `wfs` survives browser refresh, bookmark-and-resume, magic-link reopen on a different device, and lost-connection-then-retry. The URL token stays valid across the entire workflow.
- With `HandleStateStrategy`, `consume()` still runs atomically on every resume — but only as a short mutex against simultaneous resumes. Two concurrent tabs calling the same `wfs`: one wins, the other gets 410. After the winner re-persists under the same handle, the loser's *next* attempt succeeds (the token is alive again).
- With `EncapsulatedStateStrategy`, the token IS the state; `consume()` is a stateless no-op, and a copy of the token remains valid for the full TTL. The strategy cannot enforce any kind of single-use semantics. The token also changes on every persist because the ciphertext is a function of the (now-advanced) state — so `EncapsulatedStateStrategy` does effectively rotate the token even though the engine asks it to reuse the handle.

Replay protection on a leaked `HandleStateStrategy` token: the workflow record advances after each step, so a replayed token resumes from wherever the workflow currently is — there is no way to re-execute a previous step. An attacker who can intercept the token in transit can also intercept anything that would have rotated it, so transport-level rotation never provided meaningful protection against that threat model. Steps with non-idempotent side effects should guard themselves at the step layer (idempotency keys in the form payload, advance counters, etc.); do not rely on token rotation for replay safety.

### Resume Semantics

On every resume the trigger calls `strategy.consume()` atomically before running the step handler. After the step returns, the engine re-persists under the **same** handle so the URL `wfs` stays live for the duration of the workflow.

A replay that loses the race against a concurrent resume — or a request after the workflow has finished — responds with HTTP **410 Gone** and body `{ error: 'Invalid or expired workflow state' }`. With `EncapsulatedStateStrategy`, `consume()` is a stateless no-op (see the security note above) and the token remains replayable until TTL.

### Error Status Codes

The trigger sets the HTTP status via `useResponse().setStatus(...)` — the body always carries `{ error: '...' }` only:

| Branch                                | HTTP status |
| ------------------------------------- | ----------- |
| Expired / invalid resume token        | 410 Gone    |
| `wfid` not in `allow` list            | 403         |
| `wfid` in `block` list                | 403         |
| Missing both `wfs` and `wfid`         | 400         |
| Unknown outlet name returned by step  | 500         |

On pause — including a re-pause at the same step for validation retry, and on advance to the next paused step — the trigger re-persists state under the **same** handle (with `HandleStateStrategy`). The `wfs` returned in the response equals the one in the request, so a step handler that validates input and decides to re-prompt via `outletHttp(form, { error: 'invalid' })` returns the unchanged token, and the caller (or a refresh) keeps using it.

`EncapsulatedStateStrategy` is the exception: the token IS the encrypted state, so the returned `wfs` differs from the one in the request whenever the state changes. The client should always read the token from the response body or cookie on this strategy.

**Fail-closed on unexpected errors.** A consumed handle is restored only after the step returns. If the step throws unexpectedly, the engine never reaches the re-persist call — the handle is gone and the user must restart the workflow. This is the security-preferred behavior (no lingering replayable token after a failed attempt). Handle expected validation failures by returning an outlet signal from the step handler (the engine re-persists under the same handle on the re-pause), NOT by throwing.

### Token Configuration

**`token.read`** — where to look for the state token in incoming requests. Checked in order:

```ts
{ token: { read: ['body', 'query', 'cookie'] } }  // default
{ token: { read: ['cookie'] } }                     // cookie-only
```

**`token.write`** — how to return the token to the client:

- `'body'` (default) — merges the token into the JSON response body
- `'cookie'` — sets an httpOnly cookie

### Access Control

```ts
{
  allow: ['signup', 'reset-password'],  // only these workflows can be started
  block: ['admin-setup'],               // these are always blocked
}
```

### Initial Context

Seed the workflow context from the request body when starting:

```ts
{
  initialContext: (body, wfid) => ({
    source: 'web',
    locale: body?.locale ?? 'en',
  }),
}
```

### Completion Handler

Control the HTTP response when a workflow finishes, without coupling steps to HTTP:

```ts
{
  onFinished: ({ context, schemaId }) => ({
    success: true,
    result: context,
  }),
}
```

If not provided, the trigger checks `useWfFinished()` (set from within steps) and falls back to `{ finished: true }`.

## Composables

### `useWfFinished()`

Set the HTTP response for when the workflow completes. Call from the last step:

```ts
import { useWfFinished } from '@wooksjs/event-wf'

wf.step('complete', {
  handler: () => {
    useWfFinished().set({ type: 'redirect', value: '/dashboard' })
    // or
    useWfFinished().set({ type: 'data', value: { success: true }, status: 200 })
  },
})
```

This is an alternative to `onFinished` in the config — use it when different steps need different completion responses.

### `useWfOutlet()`

Advanced composable for inspecting outlet infrastructure from within steps:

```ts
import { useWfOutlet } from '@wooksjs/event-wf'

wf.step('custom-step', {
  handler: () => {
    const { getStateStrategy, getOutlet } = useWfOutlet()
    const httpOutlet = getOutlet('http')
    // ...
  },
})
```

## Full Example: Signup with Email Verification

```ts
import { createHttpApp } from '@wooksjs/event-http'
import {
  createWfApp,
  useWfState,
  useWfFinished,
  createHttpOutlet,
  createEmailOutlet,
  createOutletHandler,
  outletHttp,
  outletEmail,
  HandleStateStrategy,
  WfStateStoreMemory,
} from '@wooksjs/event-wf'

interface SignupContext {
  email?: string
  verified?: boolean
}

const wf = createWfApp<SignupContext>()

wf.step('collect-email', {
  handler: () => {
    const { input } = useWfState()
    if (input()) return
    return outletHttp({ fields: ['email'], title: 'Enter your email' })
  },
})

wf.step('send-verification', {
  handler: () => {
    const { ctx, input } = useWfState()
    const data = input<{ email: string }>()
    if (data) {
      ctx<SignupContext>().email = data.email
      return  // resume after email link clicked
    }
    return outletEmail(ctx<SignupContext>().email!, 'verify-email')
  },
})

wf.step('complete', {
  handler: () => {
    const { ctx } = useWfState()
    ctx<SignupContext>().verified = true
    useWfFinished().set({ type: 'redirect', value: '/welcome' })
  },
})

wf.flow('signup', ['collect-email', 'send-verification', 'complete'])

const http = createHttpApp()
const store = new WfStateStoreMemory()
const handle = createOutletHandler(wf)

const emailOutlet = createEmailOutlet(async ({ target, template, context, token }) => {
  console.log(`Send ${template} to ${target} with link: /signup?wfs=${token}`)
})

http.post('/signup', () =>
  handle({
    state: new HandleStateStrategy({ store }),
    outlets: [createHttpOutlet(), emailOutlet],
  })
)

// Also handle GET for email link clicks
http.get('/signup', () =>
  handle({
    state: new HandleStateStrategy({ store }),
    outlets: [createHttpOutlet(), emailOutlet],
    token: { read: ['query'] },
  })
)

http.listen(3000)
```

**Flow:**

1. `POST /signup { wfid: "signup" }` → returns form fields
2. `POST /signup { wfs: "token1", input: { email: "user@test.com" } }` → sends verification email
3. User clicks `GET /signup?wfs=token2` → workflow completes, redirect to `/welcome`
