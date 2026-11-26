# @wooksjs/event-wf -- Outlets

For workflow core (steps, flows, schema), see [event-wf.md](event-wf.md). For parent context, spies, error handling, see [wf-advanced.md](wf-advanced.md).

## Contents

- [Core Concepts](#core-concepts)
- [Outlet Signal Helpers](#outlet-signal-helpers) — `outlet`, `outletHttp`, `outletEmail`
- [WfOutletRequest](#wfoutletrequest)
- [Creating Outlets](#creating-outlets) — `createHttpOutlet`, `createEmailOutlet`, custom outlets (`tokenDelivery`)
- [State Strategies](#state-strategies) — `HandleStateStrategy` vs `EncapsulatedStateStrategy`, `WfStateStore`
- [Trigger Handler](#trigger-handler) — `createOutletHandler`, `handleWfOutletRequest`
- [WfOutletTriggerConfig](#wfoutlettriggerconfig) — `swapStrategy`, [`renewStateToken`](#renewing-the-token-inside-a-step)
- [WfOutletTokenConfig](#wfoutlettokenconfig)
- [Trigger Request Flow](#trigger-request-flow) — allow/block gating, consume semantics, fail-closed behavior, `WF_*` refusal codes
- [Transactions and envelopes](#transactions-and-envelopes) — `around`, `beforeResume`, `beforePersist`, `renderEnvelope`
- [mintWfToken](#mintwftoken) — headless start → resumable token
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

The signal object a step returns (built by the helpers above). Fields: `outlet` (outlet name — `'http'`, `'email'`, or custom) plus optional `payload` (data for the outlet), `target` (recipient, e.g. email address), `template` (template identifier), and `context` (extra data passed to the outlet).

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

**`tokenDelivery: 'out-of-band'`** — outlet delivers the token through its own channel (recipient ≠ HTTP caller); trigger suppresses body merge and cookie write so the caller receives no token, AND always persists the pause under a FRESH handle (event-wf ≥ 0.8.6): on a resume the caller holds the incoming token, which can never continue the recipient's run — with a handle strategy it answers 410 `WF_EXPIRED`; with `EncapsulatedStateStrategy` it cannot be invalidated and still replays the state from BEFORE the step (can trigger more emails, never reaches the recipient's state). With `token.write: 'cookie'` the trigger also expires the caller's spent token cookie. (Before 0.8.6, an out-of-band pause reached by a resume on the same strategy delivered the caller's own token.)

Waiting page ("check your inbox") after the resume that sent the email holds a spent token → these patterns get 410 and must change:

| Pattern on the waiting page | Do instead |
|---|---|
| "Resend" button resuming the same run | Start a NEW run. The earlier link stays valid until it expires, unless the app records the sent token and revokes it (`strategy.consume(handle)`, handle = part after the first `.`). |
| Polling the run for completion | Poll app state (a record the last step writes). |
| Typing an emailed code into the same page | In-band `outletHttp` pause whose step sends the code itself (own mailer, not the email outlet) — the page keeps its token. |

Only the holder of the LATEST link can resume from it, re-sends included: a resume with the emailed token that pauses on the email outlet again sends a new link, and the one just used stops working.

Built-in outlets: `createHttpOutlet()` = `'caller'`, `createEmailOutlet()` = `'out-of-band'`.

Any custom outlet whose resumer is a different principal than the HTTP caller MUST declare `'out-of-band'`, otherwise the caller receives a token they shouldn't have — a privilege escalation vector.

`deliver()` returns a `WfOutletResult`, but the trigger consumes only `.response` — `status`/`headers`/`cookies` returned by an outlet are ignored. Set HTTP status/headers via `useResponse()` inside `deliver()` if needed.

---

## State Strategies

Persist workflow state between pause and resume.

A `WfStateStrategy` implements three async methods: `persist(state, { ttl?, expiresAt? }, { handle? })` → token (the `handle` override is a hint to reuse an existing handle), `retrieve(token)` → state with NO invalidation and no side effects (see invariant 1), and `consume(token)` → state via atomic retrieve + invalidate. Optional pair `consumeEntry(token)` → `{ state, expiresAt }` and `persistEntry(state, { expiresAt }, { handle })` → `{ token, expiresAt }` (`0` = never, `undefined` = unknown) — `restoreOnError` needs BOTH.

Expiry of a pause = the step's `expires` (absolute ms timestamp) when it returns one, else the strategy's `defaultTtl` (ms; unset / not positive and finite = never). To learn it WITHOUT persisting (show "link valid until …"), call `strategy.expiresAtFor({ ttl?, expiresAt? }, now?)` → the absolute expiry `persist()` would apply (`0` = never, `undefined` = unknown). Both built-ins implement it and expose a `defaultTtl` getter; they return `undefined` when a subclass overrides `persist()`. It is OPTIONAL on `WfStateStrategy`: missing or `undefined` → don't display or assume an expiry, and never read it as "never". Invalid `expiresAt` → `TypeError`. Needs event-wf ≥ 0.8.3 (`@prostojs/wf` 0.3.1).

Strategies receive the RAW handle — the token minus the `<name>.` strategy prefix; they never see the prefixed token. The outlet trigger calls `strategy.consume(rawHandle)` on every resume as a brief mutex against concurrent resumes, then re-persists with `{ handle: rawHandle }` so the URL `wfs` stays stable across the entire workflow — except after a strategy swap, for an out-of-band pause, or after `renewStateToken()` (no hint → fresh handle; see trigger invariant 3). `HandleStateStrategy` honors the handle hint and reuses the same storage key. `EncapsulatedStateStrategy` ignores it (the token IS the ciphertext) and mints a fresh token on every persist anyway. See the security warning below.

### HandleStateStrategy

Stores state server-side with an opaque handle token. The handle is **minted on workflow start and reused on every resume** (the outlet trigger passes `{ handle: rawHandle }` to `persist()`; exceptions: trigger invariant 3), so the URL token survives refreshes, bookmarks, and lost-connection-then-resume across the entire workflow. **Required for security-sensitive flows** (auth, password reset, invite accept, financial operations) — and for any flow where the resume URL must remain stable across user actions.

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
  secret: process.env.WF_SECRET,  // 32-byte Buffer, or 64-char hex string (hex-decoded); constructor throws otherwise
  defaultTtl: 3600_000,           // optional, ms
})
```

**Selection rule.** If the flow has any real-world side effect (auth, credentials, money, permissions), use `HandleStateStrategy`. Use `EncapsulatedStateStrategy` only when every step is idempotent and replay-within-TTL is harmless.

### WfStateStore interface

Implement for custom persistence (Redis, database, etc.) and pass to `HandleStateStrategy`. Async methods: `set(handle, state, expiresAt?)`, `get(handle)`, `delete(handle)`, `getAndDelete(handle)` (must be atomic — it backs `consume()`; single-use tokens and `restoreOnError`'s `maxRestores` depend on it), optional `cleanup()` returning the number of purged entries.

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
  resolveSchemaId: (wfid) => wfApp.resolveSchemaId(wfid), // REQUIRED for safe allow/block
}))
```

---

## WfOutletTriggerConfig

The config object passed to the trigger handler. Fields:

- `state` (required) — a single `WfStateStrategy`, or a named registry `{ strategies: Record<name, strategy>, default: name | (wfid, flowId) => name }` (arguments as for `initialContext`). The registry form is required if any step calls `swapStrategy(name)`; `default` is picked at start time. The active strategy name is embedded in the token as a `<name>.<raw>` prefix, so storages are independent and resume picks the strategy from the token. Strategy names must match `/^[A-Za-z0-9_-]+$/`.
- `outlets` (required) — array of `WfOutlet` instances, dispatched by name.
- `allow` / `resumeOnly` / `startOnly` / `block` — judged on the **flow** (start: `flowOf(wfid)`; resume: stored `schemaId`); rejection → 403. `allow` admits only flows whose **registered id** is listed (fails closed; omitted = all, `[]` = none). `resumeOnly` flows are resumed but never started, `startOnly` flows started but never resumed (both additive to `allow`). `block` refuses `flowOf(entry)` plus the flow registered as the entry, and wins. See [Access control](#access-control-allow--resumeonly--startonly--block).
- `token` — see [WfOutletTokenConfig](#wfoutlettokenconfig).
- `wfidName` — param name for the workflow ID (default `'wfid'`).
- `initialContext(body, wfid, flowId)` — build the initial context on start. `wfid` = caller's spelling (`'user/42'` for `user/:id`); `flowId` (appended) = resolved registered flow, same as `onFinished`'s `schemaId` (raw `wfid` without a resolver). Prefer `flowId` for decisions.
- `onFinished({ context, schemaId })` — override the response for finished workflows.
- `restoreOnError` + `maxRestores` — see invariant 7 under [Trigger Request Flow](#trigger-request-flow).
- `around`, `beforeResume`, `beforePersist`, `renderEnvelope` — see [Transactions and envelopes](#transactions-and-envelopes).

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

- Format-invalid name (fails `/^[A-Za-z0-9_-]+$/`) → `swap()` throws synchronously.
- Format-valid but unregistered name → no throw at `swap()`; the trigger throws loudly at the next pause (500).
- Token whose prefix names an unknown strategy → 410 `WF_INVALID_TOKEN` (no leak of registered names).
- Token without a `.` prefix → 410 `WF_INVALID_TOKEN`.
- After a swap, the next persist mints a fresh handle in the new strategy's keyspace; before any swap, the trigger reuses the incoming raw handle so `wfs` stays stable across the workflow (exceptions: trigger invariant 3).

### Renewing the token inside a step

```ts
import { outletHttp, renewStateToken, useWfState, useWfStrategy } from '@wooksjs/event-wf'

app.step('set-password', {
  handler: async () => {
    const input = useWfState().input<{ password: string }>()
    if (!input) return outletHttp({ fields: ['password'] })
    await savePassword(input.password)
    renewStateToken()              // or useWfStrategy().renewToken()
  },
})
```

Use it in a step that raises the privilege of whoever holds the token (password set on an emailed invite, login, MFA passed): the token the run was resumed with (email, URL, history) must stop continuing the flow; only this response gets the new one. event-wf ≥ 0.8.6.

| # | Rule |
|---|---|
| 1 | Applies to the pause that ends the CURRENT request, wherever it happens in the run (a later step of the same run counts). Later requests re-use the new token as usual — a new one again only after another renewal, a strategy swap, or an out-of-band pause. |
| 2 | Handle strategy: that pause is persisted under a FRESH handle; the incoming one was consumed on resume and is never written again → old token = 410 `WF_EXPIRED`. Needs an atomic `consume`/`getAndDelete`. |
| 3 | New token delivered like any pause: body `wfs` or cookie per `token.write` (out-of-band pauses are fresh anyway). |
| 4 | No effect: `EncapsulatedStateStrategy` (every pause already gets a new token, but old tokens are NEVER invalidated — guard replays in the step with app-side state), a run that finishes in the request (nothing persisted), a start. |
| 5 | Request fails → new-handle state discarded; with `restoreOnError` the OLD state is restored under the OLD token (retry with it); without, the old token stays spent. |
| 6 | Throws outside a workflow run (e.g. in an HTTP handler) — as do `swapStrategy()` / `useWfStrategy().current()` (≥ 0.8.6). Every `useWfStrategy()` method acts on the innermost run around the caller: a run started inside a step (`eventContext: current()`, `mintWfToken`) has its own name, swaps and renewal — none cross into it or out of it. |
| 7 | Direct `start()`/`resume()` drivers: the paused output carries `output.inputRequired.renewStateToken === true` (`WfPauseRequest` field, on a COPY of the step's outlet object) → persist under a fresh handle. A driver that re-uses handles must ALSO mint a fresh one for any pause it delivers out of band — `WfPauseRequest` has no out-of-band flag. |

### Access control (`allow` / `resumeOnly` / `startOnly` / `block`)

```ts
import { normalizeWfId } from '@wooksjs/event-wf'

const config = {
  state, outlets,
  allow: ['signup', 'reset-password', 'user/:id'],  // registered ids (pattern for parametric flows)
  resumeOnly: ['invite'],                           // resumed (e.g. from an emailed link), never started
  startOnly: ['email-change'],                      // started here, confirmed only on another trigger
  block: ['admin-setup'],
}

// Compare a stored state.schemaId with your own ids the way the trigger does:
normalizeWfId('/auth/login') === normalizeWfId('auth/login')   // true (leading slash only)
```

Spec — `flowOf(id)` = the registered flow `start(id)` runs (first matching route, else `onNotFound`; `undefined` if none). `canon` = leading slashes stripped.

| #   | Rule |
| --- | ---- |
| 1   | **Identity**: start is judged on `flowOf(wfid)`; while lists are set, a `wfid` resolving to no flow → **404** (nothing to judge). Resume is judged on the stored `schemaId`, and the adapter resumes ONLY the flow registered under exactly that id, else the one equal up to leading slashes (never a routing look-alike — other case, trailing slash, instance id — never `onNotFound`; else `Unknown schemaId`). So the judged flow is the flow that runs; start and resume of one flow get the same verdict (except a `resumeOnly` / `startOnly` flow, rule 3a). A refused resume → 403, no `consume()`, no step; the token stays usable on its own trigger. |
| 2   | **BLOCK** denies, per entry, `canon(flowOf(entry))` **and** `canon(entry)`. `'adm%69n'`, `'Admin'` under `ignoreCase`, `'x'` for a flow registered `'x/'`, `'user/42'` for `'user/:id'` all block that flow. May over-block, never under-blocks. Unresolvable entry → warning once. |
| 3   | **ALLOW** fails closed: flow F admitted only if some `canon(entry) === canon(F's registered id)` (the pattern for parametric flows). Resolution NEVER admits: `'user/42'`, a typo, or an `onNotFound` target not listed by id admit nothing (warning once). Omitted → all; **`[]` → none**. |
| 3a  | **RESUME-ONLY** / **START-ONLY** (mirror images, additive to `allow`): the kind the list never allows (start for `resumeOnly`, resume for `startOnly`) is refused like BLOCK (`canon(flowOf(entry))` ∪ `canon(entry)`; `WF_FORBIDDEN` reason `'not-allowed'` — same body as an `allow` refusal — even if `allow` lists it; a refused resume is not consumed); the other kind is admitted like ALLOW (`canon(entry) === canon(registered id)` only — `'user/42'` admits nothing, warning once). `resumeOnly`: a flow started elsewhere (admin route, `mintWfToken`) that a public trigger only continues. `startOnly`: a flow issued here whose link is accepted only on another trigger — never resumable on this trigger, so not for a flow that asks the starter for more input on the same route. A flow in both → neither started nor resumed. `[]` = no effect. `allow: []` + one list = a start-only / resume-only trigger for exactly those flows. |
| 3b  | Truth table — **block**: start ✗ resume ✗ (wins over all; reason `'blocked'`) · **resumeOnly**: start ✗ resume ✓ · **startOnly**: start ✓ resume ✗ · **allow**: ✓ ✓ · **none**: ✓ ✓ only when `allow` omitted. |
| 4   | Lists work per **flow**, not per instance — gate instances inside steps. |
| 5   | WF_FLOW handlers must be **pure**. `flow()` handlers resolve without running (`init` runs once per start). A custom `WF_FLOW` handler / `onNotFound` is called — in a throwaway WF context with the requested `schemaId`, route params and the request as parent — for an unroutable request id on every start (then again by `start()`; while lists are set, `start()` refuses a flow other than the judged one via `expectSchemaId` — without lists a non-deterministic `onNotFound` stays free, so `flowId` given to `default`/`initialContext` may differ from the flow that runs), for each unroutable `block` entry on every request, each unroutable `resumeOnly` entry on every start, each unroutable `startOnly` entry on every resume, and once per process per unroutable `allow` / `resumeOnly` / `startOnly` entry. A throw during entry resolution = entry unresolved (never a 500). |
| 6   | `createOutletHandler(wfApp)` wires `resolveSchemaId`. Hand-written deps MUST pass it. |
| 7   | **Fallback** (no resolver; warning once when lists set): `%`/`?` in `wfid` → 400; `block` refuses ids equal to an entry ignoring case/trailing slash, or matched by the entry used as a route pattern (`:x`, `:x?`, `:a-:b`, `:x(regex)`, `*`) case-/trailing-slash-insensitively; `allow` exact on the request id (start) / stored id (resume) — at start it judges the spelling, so an instance/typo entry can reach the flow the router maps it to; `resumeOnly` refuses starts (`startOnly` resumes) like that `block` and admits resumes (`startOnly` starts) like that `allow`; `onNotFound` invisible. |

### Strategy across direct start/resume (no trigger)

Driving `app.start()` / `app.resume()` yourself (offline resume drivers, queues):

```ts
// set the initial strategy name for the run
const output = await wf.start('signup', ctx, { strategy: { name: 'enc' } })
// post-swap name surfaces on the paused output (reflects any swapStrategy() call)
const next = output.inputRequired?.stateStrategy   // e.g. 'kv' | undefined
await wf.resume(saved, { input, strategy: { name: next } })
```

- The adapter carries only the **name** (`strategy: { name }`); strategy instances live in your registry, never in workflow state.
- `output.inputRequired.stateStrategy` (`WfPauseRequest` field) = strategy name active at pause, so the caller persists `output.state` under the right keyspace without reading EventContext.
- `output.inputRequired.renewStateToken` (`WfPauseRequest` field) = `true` when a step called `renewStateToken()` — persist that pause under a fresh handle.

---

## WfOutletTokenConfig

Controls how state tokens are read from requests and written to responses. The trigger consumes on every resume (as a brief mutex) and re-persists under the same handle so the `wfs` stays stable across the workflow (exceptions: trigger invariant 3). For out-of-band outlets (email, SMS, etc.), the token is NOT written to the HTTP response (body or cookie is suppressed) and is always a fresh handle, so the HTTP caller cannot replay it; this is controlled by the outlet's `tokenDelivery` field, not this config.

Fields: `read` — where to look for the token (default `['body', 'query', 'cookie']`); `write` — `'body'` (default) or `'cookie'` (httpOnly, `SameSite=Strict`, `Path=/`); `name` — token param name (default `'wfs'`).

Cookie transport (≥ 0.8.6) — a token in the request wins over `wfid`, so:

| # | Rule |
|---|---|
| 1 | A RESUME that finishes the run or pauses it OUT OF BAND expires (`Max-Age=0`, same attributes) the token cookie when it holds EXACTLY the resumed token (whatever source the token was read from) — only when the whole request succeeded. |
| 2 | A START over a dead cookie: a request with `wfid` whose token came ONLY from the cookie ignores that token when refused `WF_EXPIRED` / `WF_INVALID_TOKEN` and runs as the start it asked for (start's own access checks; an in-band pause sets the new cookie; a finish / out-of-band start leaves the cookie). A body/query token is NEVER ignored; `WF_FORBIDDEN` is never ignored. |
| 3 | A RESUME (no `wfid`) with a dead token → 410 and the cookie is left alone — a double submit never loses the token the other request keeps or restores (`restoreOnError`). Errors never touch the cookie. |
| 4 | Send `wfid` only to start: a resume that also sends `wfid` starts a NEW run when its cookie token is gone (e.g. while a concurrent request holds it). A client that resumes through the cookie by sending `wfid` (e.g. `@atscript/vue-wf` `start()` with cookie transport — how a reload resumes) forks a NEW run if another request of the same run is in flight (its token is consumed at that moment) — same browser and principal, so not a bypass; clients must not start while a request of the run is in flight. |
| 5 | Cookie triggers that do not share `state` need DISTINCT `token.name` values (the cookie path cannot be set): any in-band pause sets the cookie of that name, replacing the other trigger's token (that run stays live but unreachable from the browser). |

---

## Trigger Request Flow

The trigger reads `wfs` (state token) and `wfid` (workflow ID) from body, query params, or cookies per `token.read` config.

- If `wfs` is present: **resume** — with access lists or `beforeResume` set, the trigger first calls `strategy.retrieve(rawHandle)`, checks the stored `schemaId` against the lists, then calls `beforeResume(state, { strategy })`; a refused token (403, or whatever `beforeResume` throws) is NOT consumed (it stays usable on the trigger it belongs to). Then it calls `strategy.consume(rawHandle)` (the token minus its `<name>.` prefix; atomic retrieve + invalidate) BEFORE running the step, then re-persists the advanced state under the **same** raw handle so the URL token stays valid (exceptions: invariant 3). A request that loses the race against a concurrent resume — or any request after the workflow finished or an unexpected error burned the handle — is refused with **410** `WF_EXPIRED`. With `EncapsulatedStateStrategy` `consume()` is a stateless no-op and the token remains replayable until TTL.
- If `wfid` is present (no `wfs`): **start** — resolves `wfid` to its flow (`flowOf`), judges that flow against the access lists, calls the `default` strategy picker and `initialContext` with `(…, wfid, flowId)`, starts the workflow. A non-string `wfid` (array/object/number from a JSON body) → **400** `WF_INVALID`.
- If neither: **400** `WF_MISSING`.

Every refusal is THROWN as `HttpError` (reaches moost error interceptors and `transformErrorBody`); body = `{ statusCode, error: <status text>, message, code, params? }`. Codes exported as `WF_TRIGGER_ERRORS` (`code → { status, message }`) and type `WfTriggerErrorCode`:

| Code | Status | Condition | `params` |
| --- | --- | --- | --- |
| `WF_MISSING` | 400 | neither `wfs` nor `wfid` | — |
| `WF_INVALID` | 400 | non-string `wfid`; or `%`/`?` in `wfid`, lists set, deps without `resolveSchemaId` | — |
| `WF_INVALID_TOKEN` | 410 | malformed token / unknown strategy prefix | — |
| `WF_EXPIRED` | 410 | state expired, already used, or never existed | — |
| `WF_FORBIDDEN` | 403 | `allow`/`resumeOnly`/`startOnly`/`block` refuses (start, or resume — token NOT consumed) | `reason: 'not-allowed'\|'blocked'`, `wfid` (start only) |
| `WF_NOT_FOUND` | 404 | `wfid` resolves to no flow, lists set, with `resolveSchemaId` | `wfid` |
| `WF_UNKNOWN_OUTLET` | 500 | step paused on an unregistered outlet | `outlet` |

Before 0.8.0 these were RETURNED as `{ error: '<message>' }` with `setStatus()`: the text is now in `message` (`error` = status text). Read `body.message ?? body.error` for both.

### Trigger invariants

| #   | Invariant |
| --- | --------- |
| 1   | Resume gates, then consumes: with access lists or `beforeResume` set, `strategy.retrieve(rawHandle)` → access check on the stored `schemaId` → `beforeResume` (once) → consume (`consumeEntry()` if the strategy has `consumeEntry` + `persistEntry`, else `consume()`) → lists re-checked on the consumed state → step; with neither it consumes directly. A refused token is never consumed. A consumed handle is restored (re-persisted) only after the step returns. Custom strategies MUST implement `retrieve()` without invalidating the handle. |
| 2   | On pause (initial or re-pause), the trigger persists state, dispatches to the outlet, and returns the outlet's `.response`. |
| 3   | With `HandleStateStrategy` the persisted handle equals the incoming `wfs` on resume — EXCEPT (fresh handle; the incoming one is never written again → 410) on start, after `swapStrategy()` to another name (new strategy's keyspace), for an OUT-OF-BAND pause (≥ 0.8.6: the caller holds the incoming token, so the recipient must get another), and after `renewStateToken()` in the run (≥ 0.8.6); with `EncapsulatedStateStrategy` the token always changes — the ciphertext is a function of the new state. |
| 4   | The token is merged into the response (body or cookie per `token.write`) only if the outlet declares `tokenDelivery: 'caller'` (the default for HTTP outlets). For `'out-of-band'` outlets (email, SMS, etc.) the response does NOT contain the token — the outlet delivers it through its own channel. |
| 5   | On finish: `onFinished` callback, then `useWfFinished()`, then `{ finished: true }`. The handle is NOT re-persisted — it remains deleted from the consume call earlier in the request. |
| 6   | For finished workflows, `useWfFinished().set({ type, value, status })` propagates `status` to the HTTP response: redirects default to 302; data responses leave the status untouched (HTTP method default) unless `status` is set explicitly. |
| 7a  | NO FORK: a failed request discards any state it persisted under a NEW handle (strategy swap, renewal, out-of-band pause) before restoring — and restores the client's own token (not committed → the new token never reached the client); a failing discard or a no-op `consume` (Encapsulated) is logged and leaves an unreachable state behind. After a successful OUT-OF-BAND delivery the request is committed: no discard, no restore — the delivered token wins; exactly one continuation survives (restored old, or the new one only if it went under the client's SAME handle; none without `restoreOnError`). Token cookies are set only after the whole request succeeded — never on an error response. A failed start leaves nothing. A restore re-runs EVERY step of the failed run (also ones that succeeded before `persist`/deliver/`renderEnvelope`/`onFinished` failed) → idempotent steps. |
| 7   | Fail-closed on unexpected errors (default): ANY failure after consume (step, `beforePersist`, unknown strategy/outlet, persist, delivery, `renderEnvelope`, `onFinished`) leaves the handle gone — unless the new state was already persisted under the same handle. Handle expected validation failures by returning an outlet signal (re-persists under the same handle), not by throwing. Opt-in `restoreOnError: true \| (err) => boolean` + `maxRestores` (covers every one of those stages) (default 3, counted in `meta.restores`): re-persists the pre-step state under the same handle via `persistEntry` with the exact expiry `consumeEntry` reported (`0` = never); **rolls back ALL context writes of the failing step — in-context attempt counters/lockouts never fire**; unknown expiry (no `consumeEntry`+`persistEntry` pair, or `expiresAt` undefined) or already expired → not restored. Needs an atomic `consume`/`getAndDelete`. Full table: docs "Retrying a failed resume". |
| 8   | Strategy comes from the token's `<name>.` prefix on resume, never from `wfid` (`wfid` is read only on start: allow/block checks + resolving the `default` name; on resume allow/block are checked against the stored `schemaId`, never the request's `wfid`). The trigger reuses the incoming handle (keeping `wfs` stable) only when the post-swap strategy name equals the incoming prefix — a `swapStrategy()` during the step, or a start with no incoming token, mints a fresh handle in the new strategy's keyspace (other fresh-handle cases: invariant 3). See [Swapping strategies inside a step](#swapping-strategies-inside-a-step). |

### Transactions and envelopes

```ts
handle({
  ...config,
  around: (run) => db.transaction(() => run()),                // one tx per request
  beforeResume: async (state, { strategy }) => {                // refuse BEFORE the token is consumed
    if (strategy !== 'store') throw new HttpError(403)
    if (await isMember(state.context)) throw new HttpError(409, 'Already a member')
  },
  beforePersist: (state, pause) => { if (tooBig(state)) throw new HttpError(413) },
  renderEnvelope: (envelope, info) => translate(envelope, useLocale().get(), info),
})
```

| # | Rule |
|---|---|
| 0 | Put the state store INSIDE `around`'s transaction: a commit failure after `run()` succeeded otherwise strands the flow (token consumed, new state persisted/delivered, step writes rolled back). |
| 1 | `around(run)` wraps the access-list checks, `beforeResume`, consume/start/resume, `beforePersist`, persist and outlet delivery (body parsing happens before). Return/rethrow what `run()` returns/throws; calling `run()` again after a failure (retrying transaction) is fine — each run starts over from the request. Same-DB state store + step writes → a step error rolls back the consumed token too — and any `restoreOnError` restore + its counter, so `maxRestores` won't bound retries of a request that keeps failing. |
| 1a | `beforeResume(state, { strategy })` runs on every resume, inside `around`, after the lists admitted the token and BEFORE it is consumed — once per run (not again on the consumed state). `state` = as `retrieve()` returned it — treat as read-only (on an in-memory store it IS the stored state, so a change would be resumed); `strategy` = the token's `<name>.` prefix (`'default'` for a single strategy). Throw → that error reaches the client unchanged; nothing consumed, persisted, run or delivered; the token stays usable here or on another trigger. Not called on start, after a list refusal, or for a gone token (410 `WF_EXPIRED` as before). Setting it makes every resume `retrieve()` first (custom strategies: side-effect-free `retrieve`). It judges the state as read before the token is taken: a concurrent resume of the same token that pauses again in between is unseen — checks that must hold when the step runs go in the step. |
| 2 | `beforePersist(state, pause)` runs inside `around`, right before persisting a pause; `state.meta.outlet` already set. Throw → nothing persisted, outlet not called. Not called on finish. |
| 3 | `renderEnvelope(envelope, info)` maps the pause envelope (before the `wfs` token is merged; `info.phase === 'paused'`, `outlet`, `schemaId`, `context`) and the finished value (`useWfFinished` data / `onFinished` result / `{ finished: true }`; `phase: 'finished'`). May be async. Never applied to redirects or refusals (use `transformErrorBody`). |
| 4 | Store codes, not translated text, in the workflow context — render per request with `useLocale()`. |

---

## mintWfToken

Headless start → token the trigger resumes (invites, approval links). `@wooksjs/event-wf`.

```ts
const { token, inputRequired, expiresAt } = await mintWfToken(wfApp, {
  wfid: 'invite', context: { email }, state: triggerConfig.state, ttl: 7 * 24 * 3600_000, meta: { issuedBy },
})
```

| # | Rule |
|---|---|
| 1 | Pass the SAME `state` config as the resuming trigger: token = `<strategy>.<handle>` from that registry (honours `swapStrategy()` and a `default(wfid, flowId)` picker). |
| 2 | Persists `meta.outlet` like the trigger and tracks expiry → `restoreOnError` works on the first resume. Your `meta` can't set trigger/strategy-owned keys (`outlet`, `restores`, `__wf*` — dropped); the rest is kept on every later pause. `ttl` is ms; with step `expires`, the earlier wins. |
| 3 | No outlet is called — deliver the token yourself. No access-list check at mint (applied on resume — list the flow in `resumeOnly` so a public trigger resumes but never starts it). |
| 4 | Flow finishes without pausing → `token: undefined`. Unknown default strategy → throws before running. |
| 5 | `wfApp` = anything with `start()` (`WooksWf`, `MoostWf`); typed apps (`createWfApp<T>()`) are accepted, as by `createOutletHandler`. |

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

`set()` accepts: `type` (`'redirect' | 'data'`), `value` (redirect URL or response body), optional `status` (default 200 for data, 302 for redirect), optional `cookies` (`Record<name, { value, options? }>`).

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
