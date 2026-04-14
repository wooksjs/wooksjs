# @wooksjs/event-wf -- Outlets

## Table of Contents

1. [Core Concepts](#core-concepts)
2. [Outlet Signal Helpers](#outlet-signal-helpers)
3. [WfOutletRequest](#wfoutletrequest)
4. [Creating Outlets](#creating-outlets)
5. [State Strategies](#state-strategies)
6. [Trigger Handler](#trigger-handler)
7. [WfOutletTriggerConfig](#wfoutlettriggerconfig)
8. [WfOutletTokenConfig](#wfoutlettokenconfig)
9. [Trigger Request Flow](#trigger-request-flow)
10. [useWfFinished](#usewffinished-composable)
11. [useWfOutlet](#usewfoutlet-composable)
12. [Full Round-Trip Example](#full-outlet-round-trip-example)

For workflow core (steps, flows, schema), see [event-wf.md](event-wf.md).
For parent context, spies, and error handling, see [wf-advanced.md](wf-advanced.md).

---

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

---

## State Strategies

Persist workflow state between pause and resume.

```ts
interface WfStateStrategy {
  persist(state: WfState, options?: { ttl?: number }): Promise<string>
  retrieve(token: string): Promise<WfState | null>
  consume(token: string): Promise<WfState | null>  // retrieve + delete (single-use)
}
```

### EncapsulatedStateStrategy

Encrypts state into the token itself (no server-side storage needed). Good for stateless
deployments:

```ts
import { EncapsulatedStateStrategy } from '@wooksjs/event-wf'

const strategy = new EncapsulatedStateStrategy({
  secret: process.env.WF_SECRET,  // string | Buffer
  defaultTtl: 3600_000,           // optional, ms
})
```

### HandleStateStrategy

Stores state server-side with an opaque handle token. Requires a `WfStateStore`:

```ts
import { HandleStateStrategy, WfStateStoreMemory } from '@wooksjs/event-wf'

const strategy = new HandleStateStrategy({
  store: new WfStateStoreMemory(),  // or custom WfStateStore implementation
  defaultTtl: 3600_000,
  generateHandle: () => crypto.randomUUID(), // optional
})
```

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
  state: WfStateStrategy | ((wfid: string) => WfStateStrategy)
  outlets: WfOutlet[]
  allow?: string[]              // whitelist of allowed workflow IDs
  block?: string[]              // blacklist (checked after allow)
  token?: WfOutletTokenConfig
  wfidName?: string             // param name for workflow ID (default: 'wfid')
  initialContext?: (body: Record<string, unknown> | undefined, wfid: string) => unknown
  onFinished?: (ctx: { context: unknown; schemaId: string }) => unknown
}
```

---

## WfOutletTokenConfig

Controls how state tokens are read from requests and written to responses:

```ts
interface WfOutletTokenConfig {
  read?: Array<'body' | 'query' | 'cookie'>   // default: ['body', 'query', 'cookie']
  write?: 'body' | 'cookie'                   // default: 'body'
  name?: string                                // token param name (default: 'wfs')
  consume?: boolean | Record<string, boolean>  // default: { email: true }
}
```

---

## Trigger Request Flow

The trigger reads `wfs` (state token) and `wfid` (workflow ID) from body, query params, or
cookies per `token.read` config.

- If `wfs` is present: **resume** -- retrieves state via strategy, resumes workflow.
- If `wfid` is present (no `wfs`): **start** -- creates initial context, starts workflow.
- If neither: returns `{ error: '...', status: 400 }`.

On pause, the trigger persists state, dispatches to the outlet, and returns the outlet's response
with the state token embedded (in body or cookie per `token.write`).

On finish, the trigger checks `onFinished` callback, then `useWfFinished()`, then returns
`{ finished: true }`.

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

const { getStateStrategy, getOutlets, getOutlet } = useWfOutlet()
getOutlet('http')          // WfOutlet | null
getStateStrategy()         // WfStateStrategy
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
