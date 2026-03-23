# Outlets

Outlets let workflows **pause and deliver a request to the outside world** — render an HTTP form, send an email with a magic link, or dispatch to any custom delivery channel. When the user responds (submits the form, clicks the link), the workflow **resumes** automatically.

The outlet system handles state persistence, token generation, token consumption (single-use for email, reusable for HTTP), and HTTP response building — so your step handlers stay declarative.

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
  async deliver(request, token) {
    await smsService.send(request.target!, `Your code: ${token}`)
    return { response: { sent: true } }
  },
}
```

## Configuration

The `handleWfOutletRequest` function (or the handler returned by `createOutletHandler`) accepts a `WfOutletTriggerConfig`:

```ts
interface WfOutletTriggerConfig {
  state: WfStateStrategy | ((wfid: string) => WfStateStrategy)
  outlets: WfOutlet[]
  token?: {
    name?: string                              // default: 'wfs'
    read?: Array<'body' | 'query' | 'cookie'>  // default: ['body', 'query', 'cookie']
    write?: 'body' | 'cookie'                  // default: 'body'
    consume?: boolean | Record<string, boolean> // default: { email: true }
  }
  wfidName?: string                            // default: 'wfid'
  allow?: string[]
  block?: string[]
  initialContext?: (body, wfid) => unknown
  onFinished?: (ctx: { context, schemaId }) => unknown
}
```

### State Strategies

State strategies control how workflow state is persisted between pause and resume.

**`HandleStateStrategy`** — server-side storage with a short handle/UUID as token:

```ts
import { HandleStateStrategy, WfStateStoreMemory } from '@wooksjs/event-wf'

const strategy = new HandleStateStrategy({
  store: new WfStateStoreMemory(),  // in-memory (dev/test only)
  defaultTtl: 60_000,              // 1 minute expiry
})
```

For production, implement the `WfStateStore` interface backed by Redis, a database, etc.

**`EncapsulatedStateStrategy`** — stateless, encrypted token (no server storage needed):

```ts
import { EncapsulatedStateStrategy } from '@wooksjs/event-wf'

const strategy = new EncapsulatedStateStrategy({
  secret: crypto.randomBytes(32),  // 32-byte AES-256 key
  defaultTtl: 300_000,             // 5 minutes
})
```

The entire workflow state is encrypted into the token itself using AES-256-GCM.

### Token Configuration

**`token.read`** — where to look for the state token in incoming requests. Checked in order:

```ts
{ token: { read: ['body', 'query', 'cookie'] } }  // default
{ token: { read: ['cookie'] } }                     // cookie-only
```

**`token.write`** — how to return the token to the client:

- `'body'` (default) — merges the token into the JSON response body
- `'cookie'` — sets an httpOnly cookie

**`token.consume`** — controls single-use vs reusable tokens per outlet:

```ts
// Default: email tokens are consumed, HTTP tokens are reusable
{ token: { consume: { email: true } } }

// All tokens are single-use:
{ token: { consume: true } }

// All tokens are reusable:
{ token: { consume: false } }
```

When a token is consumed, it is invalidated after the first resume — preventing replay attacks on email magic links.

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
