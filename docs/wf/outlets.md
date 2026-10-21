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
    const { ctx, input } = useWfState()
    const data = input<{ email: string }>()
    if (!data) return outletHttp({ fields: ['email'] }) // pause and ask client
    ctx<{ email?: string }>().email = data.email        // consume on resume
  },
})

wf.flow('signup', ['ask-email'])

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

::: warning Input reaches only the paused step
The run input is visible only to the **first** step executed in a run (start or resume) — the paused step itself. Subsequent steps in the same run see `input()` as `undefined`, so the pausing step must consume and persist its own input (as `ask-email` does above).
:::

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
        default: string | ((wfid: string, flowId: string) => string)
      }
  outlets: WfOutlet[]
  token?: {
    name?: string                              // default: 'wfs'
    read?: Array<'body' | 'query' | 'cookie'>  // default: ['body', 'query', 'cookie']
    write?: 'body' | 'cookie'                  // default: 'body'
  }
  wfidName?: string                            // default: 'wfid'
  allow?: string[]                             // checked on start AND resume
  block?: string[]                             // checked on start AND resume
  initialContext?: (body, wfid, flowId) => unknown
  onFinished?: (ctx: { context, schemaId }) => unknown
  restoreOnError?: boolean | ((error: unknown) => boolean) // default: false — see "Retrying a failed resume"
  maxRestores?: number                         // default: 3
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

`swapStrategy()` validates only the name **format** (`/^[A-Za-z0-9_-]+$/` —
format violations throw at the call site). A well-formed name missing from the
registry errors loudly at the next pause instead: the trigger throws
`Workflow paused with unknown strategy '<name>' …` — a config bug, surfaced as
a 500. Tokens whose prefix names an unknown strategy return HTTP 410 (same as
any invalid token — the trigger does not leak which strategies are registered).

When you drive `start()` / `resume()` directly (instead of through the outlet
trigger), set the initial strategy with the `strategy` run option and read the
post-swap name off the paused output — handy for offline resume drivers that
persist state under a strategy-specific keyspace:

```ts
const output = await wf.start('signup', ctx, { strategy: { name: 'enc' } })

if (output.inputRequired) {
  const next = output.inputRequired.stateStrategy // post-swap name, e.g. 'kv'
  // persist output.state under `next`'s keyspace, then later:
  // await wf.resume(saved, { input, strategy: { name: next } })
}
```

The adapter carries only the strategy *name* — the strategy instances live in
your trigger registry (or your own resume driver), never in the workflow state.

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

When `allow` / `block` are set, the trigger first reads the state with `strategy.retrieve()` and checks it (see [Access Control](#access-control)); a refused token is **not** consumed. A custom `WfStateStrategy` must therefore implement `retrieve()` as a side-effect-free read that never invalidates the handle. The trigger then consumes the state atomically (`consumeEntry()` when the strategy implements both `consumeEntry()` and `persistEntry()`, else `consume()`) before running the step handler. After the step returns, the engine re-persists under the **same** handle so the URL `wfs` stays live for the duration of the workflow.

A replay that loses the race against a concurrent resume — or a request after the workflow has finished — responds with HTTP **410 Gone** and body `{ error: 'Invalid or expired workflow state' }`. With `EncapsulatedStateStrategy`, `consume()` is a stateless no-op (see the security note above) and the token remains replayable until TTL.

### Error Status Codes

The trigger sets the HTTP status via `useResponse().setStatus(...)` — the body always carries `{ error: '...' }` only:

| Branch                                | HTTP status |
| ------------------------------------- | ----------- |
| Expired / invalid resume token        | 410 Gone    |
| `wfid` resolves to a flow not in `allow` (or `allow: []`) | 403 |
| `wfid` resolves to a flow in `block`  | 403         |
| Resume token for a workflow not in `allow` / in `block` | 403 (token not consumed) |
| `wfid` is not a string                | 400         |
| `wfid` contains `%` / `?`, lists set, deps without `resolveSchemaId` | 400 |
| Missing both `wfs` and `wfid`         | 400         |
| `wfid` resolves to no flow while `allow`/`block` is set (with `resolveSchemaId`) | 404 |
| Unknown outlet name returned by step  | 500         |

On pause — including a re-pause at the same step for validation retry, and on advance to the next paused step — the trigger re-persists state under the **same** handle (with `HandleStateStrategy`). The `wfs` returned in the response equals the one in the request, so a step handler that validates input and decides to re-prompt via `outletHttp(form, { error: 'invalid' })` returns the unchanged token, and the caller (or a refresh) keeps using it.

`EncapsulatedStateStrategy` is the exception: the token IS the encrypted state, so the returned `wfs` differs from the one in the request whenever the state changes. The client should always read the token from the response body or cookie on this strategy.

**Fail-closed on unexpected errors (default).** A consumed handle is restored only after the step returns. If the step throws unexpectedly, the engine never reaches the re-persist call — the handle is gone and the user must restart the workflow. This is the security-preferred behavior (no lingering replayable token after a failed attempt). Handle expected validation failures by returning an outlet signal from the step handler (the engine re-persists under the same handle on the re-pause), NOT by throwing.

#### Retrying a failed resume (`restoreOnError`)

Set `restoreOnError` on the trigger config to let the user retry the same token after a resumed step throws:

```ts
class InfraError extends Error {}

{
  restoreOnError: (error) => error instanceof InfraError, // or `true` for every error
  maxRestores: 3,                                          // default
}
```

| Question | Behaviour |
| --- | --- |
| Which errors | `true`: any error thrown out of the resumed run, including an `HttpError` thrown by a step. A function: only errors it returns `true` for. Re-pauses (an outlet signal, `StepRetriableError`) are not errors and re-persist as usual. Refused resumes (403/410) never consume, so they need no restore. |
| What is restored | The state exactly as it was consumed — a deep copy taken **before** the step ran — under the **same handle** and strategy. |
| Lifetime | Never extended. The state is put back with the exact expiry it was consumed with, as reported by `strategy.consumeEntry()` (a timestamp, or `0` for "never expires"), written back with `strategy.persistEntry()`. When the expiry is unknown — the strategy lacks `consumeEntry()` or `persistEntry()`, or its store does not report `expiresAt` — the state is not restored and a warning is logged once. An entry that expired while the step ran is not restored. |
| Cap | At most `maxRestores` restores per handle (counted in `state.meta.restores`, carried while the handle is re-used). After that the handle stays burned. `maxRestores: 0` disables restoring. |
| Response | Unchanged: the step's error propagates exactly as without the option. A failed restore is logged, never thrown. |
| `HandleStateStrategy` | The consumed handle becomes usable again. |
| `EncapsulatedStateStrategy` | Nothing to do — `consume()` never invalidates its tokens. The trigger checks with `retrieve()` and skips the restore. |

A custom strategy supports restoring by implementing both `consumeEntry(token)` → `{ state, expiresAt }` and `persistEntry(state, { expiresAt }, { handle })` → `{ token, expiresAt }` (`WfConsumedEntry` / `WfPersistedEntry`; `0` = never expires, `undefined` = unknown).

::: warning Needs an atomic consume
`maxRestores` and every single-use guarantee rely on `consume()` invalidating the handle atomically — for `HandleStateStrategy`, a `WfStateStore` whose `getAndDelete()` is atomic. With a non-atomic store, concurrent resumes of one token can each run the step (and each be restored).
:::

::: danger Everything in the workflow context is rolled back
The failing step's writes to the workflow context are discarded — **including attempt counters and lockout flags kept there**. With `restoreOnError: true`, a step that counts wrong passwords in the context and throws on a wrong one never reaches its lockout; only `maxRestores` bounds the guesses. Keep attempt counters and lockouts **outside** the workflow context (a store keyed by user or handle), and prefer the predicate form, restricted to infrastructure errors (timeouts, an unavailable database).
:::

::: warning Side effects become retryable
A step that performed side effects before throwing (sent an email, charged a card) can run again with the same token. Make such steps idempotent before enabling `restoreOnError`.
:::

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
  allow: ['signup', 'reset-password'],  // only these flows can be started or resumed
  block: ['admin-setup'],               // these flows are always refused
}
```

Both lists apply to **starting** a workflow and to **resuming** one, and both judge the **flow**, not the id spelling:

- **Start** — the flow is `flowOf(wfid)`: the registered flow that `start(wfid)` would run (the first matching route, else the one `onNotFound` picks). While either list is set, a `wfid` that resolves to no flow is refused with **404** — there is nothing to judge. `start()` is told which flow was judged and refuses to run any other, so even a non-deterministic `onNotFound` cannot slip a different flow through. (This check applies only while lists are set.)
- **Resume** — the flow is the one stored in the state behind the `wfs` token. A resume runs **only** the flow registered under exactly that id — or, failing that, the one registered under the same id up to leading slashes (`'x'` ↔ `'/x'`) — never a flow the id merely routes to (another casing, a trailing slash, an instance id) and never `onNotFound`; otherwise it fails with `Unknown schemaId`. So the flow that is judged is the flow that runs. A refused token gets 403 and is **not** consumed, so it keeps working on the trigger it belongs to. A token issued by a public login flow cannot be replayed on a trigger whose lists exclude that flow.

Start and resume of the same flow always get the same answer.

**`block`** refuses, for every entry, the flow that entry would run (`flowOf(entry)`) **and** the flow registered under exactly that id. So `block: ['adm%69n']`, `block: ['Admin']` under an `ignoreCase` router, and `block: ['user/42']` for a `user/:id` flow each refuse that flow, on every instance and spelling. `block` may over-block; it never under-blocks. An entry that resolves to no flow logs a warning once.

**`allow`** fails closed. A flow is admitted only if an entry **equals its registered id** — the id you passed to `flow()`, which for a parametric flow is the pattern (`'user/:id'`). Resolution never admits anything:

| `allow` entry | admits |
| --- | --- |
| `'user/:id'` (the registered pattern) | every `user/…` instance |
| `'user/42'` (an instance) | nothing — logs a warning |
| `'reprot'` (a typo, even if a catch-all `:name` flow would run it) | nothing — logs a warning |
| the id `onNotFound` returns | that flow, only when listed by its registered id |

Omitting `allow` admits every flow. **`allow: []` admits no flow.** `block` is checked after `allow`. Ids are compared ignoring leading slashes, because adapters that register flows as `/<path>` store the id with the slash. Use the exported `normalizeWfId()` to compare a stored `schemaId` with your own ids the same way:

```ts
import { normalizeWfId } from '@wooksjs/event-wf'

normalizeWfId('/auth/login') === normalizeWfId('auth/login') // true
```

Lists work per flow, not per instance — restrict individual instances inside the flow's steps.

**Flow handlers must be pure.** Flows registered with `flow()` resolve without running anything, and their `init` runs once per start. A custom `WF_FLOW` handler or `onNotFound` reveals the flow it picks only when called, so the trigger calls it — inside a throwaway workflow context with the same `schemaId`, route params and parent context (the HTTP request) that `start()` would give it, so an `onNotFound` that reads request data resolves exactly as it runs:

- for the request id, on every start it can't route (and `start()` then calls it again);
- for each `block` entry it can't route, on every request (in that request's context);
- for each `allow` entry it can't route, once per process (only to decide whether to warn).

Return `{ id, init? }` without side effects, and put side effects in `init`. If it throws while an entry is being resolved, that entry counts as unresolved — the request is not failed.

::: warning Wire `resolveSchemaId`
`createOutletHandler(wfApp)` wires `WooksWf.resolveSchemaId` automatically. If you call `handleWfOutletRequest(config, deps)` with hand-written deps, pass `resolveSchemaId: (wfid) => wfApp.resolveSchemaId(wfid)` too.

Without it the trigger cannot know which flow an id runs. It logs a warning once when lists are set and falls back to a conservative check:

- a `wfid` containing `%` or `?` is refused with 400;
- `block` over-matches: an id is refused if it equals an entry ignoring case and trailing slashes, or if the entry, read as a route pattern (params, optional `:x?`, `:a-:b`, regex params, `*`), matches it case- and trailing-slash-insensitively;
- `allow` matches the request id exactly (leading slashes aside) on start and the stored flow id on resume. It judges the **spelling** at start, so a listed instance id or typo can still reach whatever flow the router maps it to.

The fallback cannot see `onNotFound` routing. Only the resolver makes the lists judge the flow that actually runs.
:::

### Initial Context

Seed the workflow context from the request body when starting. `wfid` is the caller's spelling — e.g. `'user/42'` for a `user/:id` flow; `flowId` is the registered flow the request resolves to (the same id `onFinished` receives as `schemaId`; the raw `wfid` without `resolveSchemaId`). Prefer `flowId` for decisions — every spelling that runs a flow resolves to its id. The `default` strategy picker of a named registry gets the same `(wfid, flowId)` pair.

With `allow` / `block` set, the flow that runs is guaranteed to be `flowId` (see [Access Control](#access-control)). Without lists, `flowId` is only the resolver's answer: if `onNotFound` is not deterministic (A/B routing, for example), the flow `start()` then runs may differ from the `flowId` the callbacks saw.

```ts
{
  initialContext: (body, wfid, flowId) => ({
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
    const { getOutlet } = useWfOutlet()
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
  verificationSent?: boolean
  verified?: boolean
}

const wf = createWfApp<SignupContext>()

wf.step('collect-email', {
  handler: () => {
    const { ctx, input } = useWfState()
    const data = input<{ email: string }>()
    if (!data) return outletHttp({ fields: ['email'], title: 'Enter your email' })
    ctx<SignupContext>().email = data.email  // consume the input here — later steps won't see it
  },
})

wf.step('send-verification', {
  handler: () => {
    const { ctx } = useWfState()
    const context = ctx<SignupContext>()
    if (context.verificationSent) return  // link clicked — continue to 'complete'
    context.verificationSent = true       // persisted with the paused state
    return outletEmail(context.email!, 'verify-email')
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
2. `POST /signup { wfs: "token", input: { email: "user@test.com" } }` → `collect-email` saves the email, `send-verification` sets the flag and sends the email
3. User clicks `GET /signup?wfs=token` → `send-verification` re-runs, sees the flag, and continues — workflow completes, redirect to `/welcome`

The link click is a `GET` with no body, so no input reaches the workflow — that's why `send-verification` uses a context flag (persisted with the paused state) rather than input to detect the resume.
