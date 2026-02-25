# HTTP Integration

Workflows are transport-independent by default — they create their own isolated event context so they can be triggered from HTTP, a queue, a cron job, or a test. But when a workflow is started from an HTTP handler, you sometimes want step handlers to access data that's already been resolved in the HTTP scope (the authenticated user, parsed headers, request metadata).

There are two approaches: **pass data explicitly** via the workflow context, or **inherit the parent context** so HTTP composables work directly inside step handlers.

[[toc]]

## Approach 1: Pass Data Explicitly

The simplest and most portable approach. Extract what you need from the HTTP scope and pass it as part of the workflow context:

```ts
import { createHttpApp, useRequest } from '@wooksjs/event-http'
import { createWfApp, useWfState } from '@wooksjs/event-wf'
import { useBody } from '@wooksjs/http-body'

interface OrderContext {
  orderId: string
  items: string[]
  total: number
  status: string
  triggeredBy: string   // data from HTTP scope
}

const wf = createWfApp<OrderContext>()

wf.step('calculate-total', {
  handler: (ctx) => { ctx.total = ctx.items.length * 10 },
})
wf.step('finalize', {
  handler: (ctx) => { ctx.status = 'confirmed' },
})
wf.flow('process-order', ['calculate-total', 'finalize'])

const http = createHttpApp()

http.post('/orders', async () => {
  const { parseBody } = useBody()
  const { getIp } = useRequest()
  const body = await parseBody<{ orderId: string; items: string[] }>()

  const output = await wf.start('process-order', {
    orderId: body.orderId,
    items: body.items,
    total: 0,
    status: 'pending',
    triggeredBy: getIp(),   // passed into workflow context
  })

  return { finished: output.finished, order: output.state.context }
})

http.listen(3000)
```

This is the right choice when:
- The workflow might be resumed later (in a different HTTP request or from a queue)
- You want workflows to be testable without an HTTP context
- You only need a few specific values from the HTTP scope

## Approach 2: Inherit the Parent Context

Pass `eventContext: current()` in the options to link the workflow to the **parent** event context. Internally, the workflow creates a child context with `parent: current()`, forming a parent chain. HTTP composables like `useRequest()`, `useCookies()`, or any custom composables you've built — all keep working inside step handlers because slot lookups traverse the parent chain automatically.

```ts
import { current } from '@wooksjs/event-core'

http.post('/orders', async () => {
  const output = await wf.start(
    'process-order',
    { orderId: '123', items: ['shirt'], total: 0, status: 'pending' },
    { eventContext: current() },
  )
  return { order: output.state.context }
})
```

Now step handlers can call HTTP composables directly — the child context delegates to the parent when a slot is not found locally:

```ts
import { useRequest } from '@wooksjs/event-http'

wf.step('finalize', {
  handler: () => {
    const { ctx } = useWfState()
    const { getIp } = useRequest()    // works via parent chain traversal

    ctx<OrderContext>().status = 'confirmed'
    ctx<OrderContext>().triggeredBy = getIp()
  },
})
```

### Extracting User Info on First Step

A common pattern: your HTTP middleware resolves the authenticated user and caches it in the event context. With `eventContext`, the workflow's child context traverses the parent chain to access cached values without re-fetching:

```ts
import { current, defineWook, cached } from '@wooksjs/event-core'
import { useRequest } from '@wooksjs/event-http'

// Custom composable — resolves and caches user from auth header
const userSlot = cached(async (ctx) => {
  const req = ctx.get(httpKind.keys.req)
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return null
  return verifyAndDecodeToken(token)  // your auth logic
})

export const useCurrentUser = defineWook((ctx) => ({
  getUser: () => ctx.get(userSlot),
}))

// HTTP handler — user is resolved here (and cached)
http.post('/workflows/start', async () => {
  const { getUser } = useCurrentUser()
  const user = await getUser()
  if (!user) return { error: 'Unauthorized' }

  const output = await wf.start(
    'onboarding',
    { userId: user.id, role: user.role, steps: [] },
    { eventContext: current() },
  )
  return output.state.context
})

// Workflow step — accesses the same cached user, no re-fetch
wf.step('check-permissions', {
  handler: async () => {
    const { ctx } = useWfState()
    const { getUser } = useCurrentUser()  // same cached result
    const user = await getUser()

    if (user?.role === 'admin') {
      ctx<OnboardingContext>().skipApproval = true
    }
  },
})
```

The `useCurrentUser()` composable runs its factory **once per event context**. When the HTTP handler calls it, the result is cached in the parent context. When the workflow step calls it, the child context traverses the parent chain and finds the cached result — no second database/token lookup.

### When to Use Each Approach

| Scenario | Recommended |
|----------|------------|
| Workflow completes within a single HTTP request | Either works |
| Workflow pauses and resumes in a different request | Pass data explicitly |
| Steps need access to many HTTP composables | Inherit context |
| Workflow is triggered from non-HTTP sources too | Pass data explicitly |
| Steps need cached values from HTTP middleware (auth, user) | Inherit context |
| You want workflows to be testable without HTTP | Pass data explicitly |

You can combine both: inherit context for the initial `start()`, but rely on the workflow context for data that must survive a `resume()` in a later request.

## Pause and Resume via HTTP API

For workflows that pause for user input, expose endpoints for starting, checking status, and resuming:

```ts
// In-memory store (use a database in production)
const workflows = new Map<string, any>()

http.post('/workflows/start/:flowId', async () => {
  const { parseBody } = useBody()
  const flowId = useRouteParams().get('flowId')
  const body = await parseBody<Record<string, unknown>>()

  const output = await wf.start(flowId, body)
  const id = crypto.randomUUID()

  if (!output.finished) {
    workflows.set(id, output.state)
  }

  return {
    id,
    finished: output.finished,
    inputRequired: output.inputRequired,
    context: output.state.context,
  }
})

http.post('/workflows/resume/:id', async () => {
  const { parseBody } = useBody()
  const id = useRouteParams().get('id')
  const { input } = await parseBody<{ input: unknown }>()

  const state = workflows.get(id)
  if (!state) return { error: 'Workflow not found' }

  const output = await wf.resume(state, { input })

  if (output.finished) {
    workflows.delete(id)
  } else {
    workflows.set(id, output.state)
  }

  return {
    id,
    finished: output.finished,
    inputRequired: output.inputRequired,
    context: output.state.context,
  }
})
```

The client flow:
1. `POST /workflows/start/signup` — starts the workflow, gets back `id` + `inputRequired`
2. Render a form based on `inputRequired`
3. `POST /workflows/resume/:id` with user input — gets next `inputRequired` or `finished: true`
4. Repeat until done

The workflow itself is completely unaware of HTTP. The HTTP layer is just the transport that shuttles state and input back and forth.
