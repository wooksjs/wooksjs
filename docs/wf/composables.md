# Composables

Wooks composables let you encapsulate repeatable patterns into functions that "just work" inside any step handler — no parameter drilling, no manual context passing. They use `AsyncLocalStorage` under the hood, so they resolve the current workflow context automatically.

[[toc]]

## Built-in Composables

These are available out of the box in workflow step handlers:

| Composable | Import | What it provides |
|------------|--------|-----------------|
| `useWfState()` | `@wooksjs/event-wf` | Workflow context, input, schema/step ids, resume flag |
| `useWfFinished()` | `@wooksjs/event-wf` | Set the HTTP response for workflow completion (used with [outlets](/wf/outlets)) |
| `useWfOutlet()` | `@wooksjs/event-wf` | Access outlet infrastructure (state strategy, outlet registry) |
| `useRouteParams()` | `@wooksjs/event-core` | Route parameters from parametric step ids |
| `useEventId()` | `@wooksjs/event-core` | Unique per-execution UUID |
| `useLogger()` | `@wooksjs/event-core` | Event-scoped logger instance |

```ts
import { useWfState } from '@wooksjs/event-wf'
import { useRouteParams, useEventId, useLogger } from '@wooksjs/event-core'

app.step('process/:type', {
  handler: () => {
    const { ctx, input } = useWfState()
    const type = useRouteParams().get('type')
    const logger = useLogger()
    const { getId } = useEventId()

    logger.info(`[${getId()}] Processing type: ${type}`)
  },
})
```

## Creating Custom Composables

When you find yourself repeating the same pattern across multiple steps, extract it into a composable.

### `defineWook` — The Core Primitive

`defineWook` creates a composable whose factory runs **once per workflow execution** and is cached for its lifetime:

```ts
import { defineWook } from '@wooksjs/event-core'

const useMyComposable = defineWook((ctx) => {
  // This factory runs once per workflow execution.
  // `ctx` is the current EventContext.
  // Return an object with your composable's API.
  return {
    doSomething: () => { /* ... */ },
  }
})
```

The returned function (`useMyComposable`) can be called from any step handler — it will always resolve to the same cached instance within a single execution.

### `key` — Mutable State

Use `key()` when you need a read/write slot that steps can modify during execution:

```ts
import { key, defineWook, current } from '@wooksjs/event-core'

const errorsKey = key<string[]>('validation.errors')

export const useValidation = defineWook((ctx) => {
  ctx.set(errorsKey, [])

  return {
    addError: (msg: string) => ctx.get(errorsKey).push(msg),
    getErrors: () => ctx.get(errorsKey),
    hasErrors: () => ctx.get(errorsKey).length > 0,
  }
})
```

Now any step can collect and check validation errors:

```ts
app.step('validate-email', {
  handler: () => {
    const { ctx } = useWfState()
    const { addError } = useValidation()
    if (!ctx<FormData>().email.includes('@')) {
      addError('Invalid email address')
    }
  },
})

app.step('check-validation', {
  handler: () => {
    const { hasErrors, getErrors } = useValidation()
    if (hasErrors()) {
      return { inputRequired: { errors: getErrors(), retry: true } }
    }
  },
})

app.flow('submit-form', ['validate-email', 'validate-name', 'check-validation', 'save'])
```

### `cached` — Lazy Computed Values

Use `cached()` for derived values that should be computed once and reused:

```ts
import { cached, defineWook } from '@wooksjs/event-core'

const configSlot = cached(async (ctx) => {
  // Expensive operation — runs once, result is cached
  const res = await fetch('https://api.example.com/config')
  return res.json()
})

export const useConfig = defineWook((ctx) => ({
  getConfig: () => ctx.get(configSlot),
}))
```

### `cachedBy` — Parameterized Caching

Use `cachedBy()` when you need one cached result per unique key:

```ts
import { cachedBy } from '@wooksjs/event-core'

const fetchUser = cachedBy(async (userId: string, ctx) => {
  const res = await fetch(`https://api.example.com/users/${userId}`)
  return res.json()
})

export const useUsers = defineWook(() => ({
  getUser: (id: string) => fetchUser(id),
}))
```

Calling `getUser('123')` twice in the same execution hits the API only once.

## Practical Examples

### Audit Trail

Track which steps executed and what they did — useful for compliance, debugging, or building activity feeds:

```ts
import { key, defineWook } from '@wooksjs/event-core'

interface AuditEntry {
  step: string
  timestamp: number
  detail?: string
}

const auditKey = key<AuditEntry[]>('wf.audit')

export const useAuditLog = defineWook((ctx) => {
  ctx.set(auditKey, [])

  return {
    record: (step: string, detail?: string) => {
      ctx.get(auditKey).push({ step, timestamp: Date.now(), detail })
    },
    getLog: () => ctx.get(auditKey),
  }
})

// Usage in steps:
app.step('approve', {
  handler: () => {
    const { ctx, input } = useWfState()
    const { record } = useAuditLog()

    const approved = input<boolean>()
    ctx<OrderContext>().approved = approved ?? false
    record('approve', `Decision: ${approved ? 'approved' : 'rejected'}`)
  },
})
```

After the workflow finishes, read the full log from any step or from the caller:

```ts
app.flow('review', ['validate', 'approve', 'finalize'], '', () => {
  useAuditLog().record('init', 'Workflow started')
})
```

### Notification Collector

Collect notifications across steps, then send them all at the end:

```ts
import { key, defineWook } from '@wooksjs/event-core'

interface Notification {
  to: string
  subject: string
  body: string
}

const notificationsKey = key<Notification[]>('wf.notifications')

export const useNotifications = defineWook((ctx) => {
  ctx.set(notificationsKey, [])

  return {
    queue: (n: Notification) => ctx.get(notificationsKey).push(n),
    getQueued: () => ctx.get(notificationsKey),
  }
})

// Steps queue notifications:
app.step('approve-order', {
  handler: () => {
    const { ctx } = useWfState()
    const { queue } = useNotifications()
    const order = ctx<OrderContext>()

    queue({
      to: order.customerEmail,
      subject: 'Order approved',
      body: `Your order #${order.id} has been approved.`,
    })
  },
})

// Final step sends them all:
app.step('send-notifications', {
  handler: async () => {
    const { getQueued } = useNotifications()
    for (const n of getQueued()) {
      await sendEmail(n.to, n.subject, n.body)
    }
  },
})
```

## Integrating with HTTP

Workflows create their own isolated event context by default, but can optionally **inherit** a parent context to share composables with the calling scope.

See [HTTP Integration](/wf/http-integration) for the full guide — starting workflows from HTTP handlers, inheriting auth context, pause/resume API patterns, and when to use each approach.
