# @wooksjs/event-wf -- Advanced

For workflow core (steps, flows, schema), see [event-wf.md](event-wf.md). For outlets (HTTP/email delivery), see [wf-outlets.md](wf-outlets.md).

## Contents

- [Parent Context Sharing](#parent-context-sharing) — inherit HTTP context into workflow steps
- [Spies](#spies) — `attachSpy`/`detachSpy`, per-execution spy
- [Error Handling](#error-handling) — `onError`, `StepRetriableError`
- [Testing](#testing) — unit tests, resume tests, outlet tests

## Parent Context Sharing

By default, `start()` and `resume()` create an isolated event context. Pass `eventContext` to
create a child context with a parent link instead:

```ts
const output = await wf.start('my-flow', initialCtx, {
  eventContext: current(),
})
```

The child context seeds its own WF slots locally. Slot lookups not found in the child automatically
traverse the parent chain. Both WF composables and parent composables (e.g. HTTP) work
transparently inside step handlers.

### HTTP -> WF integration example

```ts
import { current } from '@wooksjs/event-core'
import { createHttpApp, useRequest } from '@wooksjs/event-http'
import { createWfApp, useWfState } from '@wooksjs/event-wf'

const wf = createWfApp<{ userId: string; role: string }>()

wf.step('check-permissions', {
  handler: () => {
    const { ctx } = useWfState()
    const { headers } = useRequest()
    const user = decodeToken(headers.authorization)
    ctx<{ userId: string; role: string }>().userId = user.id
    ctx<{ userId: string; role: string }>().role = user.role
  },
})

wf.flow('secure-action', ['check-permissions', 'do-work'])

const http = createHttpApp()

http.post('/actions/run', async () => {
  const output = await wf.start(
    'secure-action',
    { userId: '', role: '' },
    { eventContext: current() },
  )
  return output.state.context
})
```

### When to inherit vs isolate

- **Inherit** (`eventContext: current()`) -- workflow runs entirely within a single HTTP request
  and steps need parent composables (auth, headers, cached user data).
- **Isolate** (default) -- workflow may pause and resume across different requests, or should be
  testable without a parent context.

---

## Spies

Observe step execution without modifying behavior.

### Global spy (all workflows)

```ts
const spy = (event, data) => {
  console.log(`[${event}]`, data)
}

app.attachSpy(spy)
app.detachSpy(spy) // remove later
```

### Per-execution spy

```ts
const output = await app.start('my-flow', { result: 0 }, {
  spy: (event, ...args) => {
    if (event === 'step') {
      console.log('Step executed:', args)
    }
  },
})
```

### Spy function signature

```ts
type TWorkflowSpy<T, I, IR> = (
  event: string,
  eventOutput: string | undefined | {
    fn: string | TWorkflowStepConditionFn<T>
    result: boolean
  },
  flowOutput: TFlowSpyData<T, IR>,
  ms?: number,
) => void
```

Use spies for logging and metrics instead of adding instrumentation inside every step.

---

## Error Handling

### Default behavior

Errors call `console.error` and `process.exit(1)`. Always provide `onError`:

```ts
const app = createWfApp({
  onError: (error) => {
    console.error(`Workflow error: ${error.message}`)
  },
})
```

### Step handler errors

Errors thrown in step handlers propagate from `app.start()` / `app.resume()`:

```ts
try {
  const output = await app.start('my-flow', { result: 0 })
} catch (error) {
  console.error('Workflow failed:', error.message)
}
```

### StepRetriableError

Signals a recoverable failure. The workflow can be resumed:

```ts
import { StepRetriableError } from '@wooksjs/event-wf'

app.step('fetch-data', {
  handler: async (ctx) => {
    try {
      ctx.data = await fetchFromApi()
    } catch (e) {
      throw new StepRetriableError('API temporarily unavailable')
    }
  },
})

try {
  await app.start('my-flow', {})
} catch (error) {
  if (error instanceof StepRetriableError) {
    await sleep(5000)
    await app.resume(error.state, { input: retryInput })
  }
}
```

Constructor signature:

```ts
class StepRetriableError<IR> extends Error {
  constructor(
    originalError: Error,
    errorList?: unknown,
    inputRequired?: IR,
    expires?: number,
  )
}
```

---

## Testing

Test workflows by calling `app.start()` directly with explicit contexts:

```ts
import { createWfApp } from '@wooksjs/event-wf'

const app = createWfApp<{ count: number }>()

app.step('increment', {
  handler: (ctx) => { ctx.count++ },
})

app.flow('test-flow', [{ id: 'increment' }, { id: 'increment' }])

const output = await app.start('test-flow', { count: 0 })
expect(output.state.context.count).toBe(2)
expect(output.finished).toBe(true)
```

### Testing resume

```ts
app.step('needs-input', {
  input: 'number',
  handler: 'ctx.count += input',
})

app.flow('resume-flow', [{ id: 'needs-input' }])

const output = await app.start('resume-flow', { count: 0 })
expect(output.finished).toBe(false)

const final = await app.resume(output.state, { input: 42 })
expect(final.state.context.count).toBe(42)
expect(final.finished).toBe(true)
```

### Testing outlets

Use `prepareTestHttpContext` from `@wooksjs/event-http` to simulate HTTP requests:

```ts
import { prepareTestHttpContext } from '@wooksjs/event-http'
import { HandleStateStrategy, WfStateStoreMemory } from '@wooksjs/event-wf'

const store = new WfStateStoreMemory()
const strategy = new HandleStateStrategy({ store })
const config = { state: strategy, outlets: [createHttpOutlet()] }

// Start
const runCtx1 = prepareTestHttpContext({
  url: '/wf',
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  rawBody: JSON.stringify({ wfid: 'my-flow' }),
})
const result = await runCtx1(() => handleWfOutletRequest(config, deps))

// Resume with token
const runCtx2 = prepareTestHttpContext({
  url: '/wf',
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  rawBody: JSON.stringify({ wfs: result.wfs, input: { email: 'a@b.com' } }),
})
const resumed = await runCtx2(() => handleWfOutletRequest(config, deps))
expect(resumed).toEqual({ finished: true })
```
