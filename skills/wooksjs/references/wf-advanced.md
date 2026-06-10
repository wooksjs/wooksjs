# @wooksjs/event-wf -- Advanced

For workflow core (steps, flows, schema), see [event-wf.md](event-wf.md). For outlets (HTTP/email delivery), see [wf-outlets.md](wf-outlets.md).

## Contents

- [Parent Context Sharing](#parent-context-sharing) — inherit HTTP context into workflow steps
- [Spies](#spies) — `attachSpy`/`detachSpy`, per-execution spy
- [Error Handling](#error-handling) — step errors, `StepRetriableError`
- [Testing](#testing) — unit tests, resume tests, outlet tests
- [Low-level Context API](#low-level-context-api) — `wfKind`, `resumeKey`, `createWfContext`/`resumeWfContext`, `wfShortcuts`

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

const detach = app.attachSpy(spy) // returns a detach function
detach()                          // or: app.detachSpy(spy)
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

`spy(event, eventOutput, flowOutput, ms)` — `event` is one of:

- `'step'` — a step executed; `eventOutput` is the step id, `ms` is duration.
- `'error'` — a non-retriable error; `eventOutput` is the message.
- A condition event — `'eval-condition-fn' | 'eval-while-cond' | 'eval-break-fn' | 'eval-continue-fn'`; `eventOutput` is `{ fn, result }`.
- `'<phase>-start'` / `'<phase>-interrupt'` / `'<phase>-end'` where phase is `workflow | resume | subflow`.

`flowOutput` carries the current flow state. Spy exceptions are caught and logged, never break the run.

Use spies for logging and metrics instead of adding instrumentation inside every step.

---

## Error Handling

### Step handler errors

Step-handler errors (other than `StepRetriableError`) propagate from `app.start()` / `app.resume()` — wrap calls in `try/catch`:

```ts
try {
  const output = await app.start('my-flow', { result: 0 })
} catch (error) {
  console.error('Workflow failed:', error.message)
}
```

The `onError` option is only consumed by the protected `onError()` hook for subclasses; `WooksWf` itself never invokes it.

### StepRetriableError

Signals a recoverable failure. The engine catches it and returns a **failed output** (it does NOT propagate as an exception): `output.finished === false` with `output.error` set to the original error. Recover via the output, not `try/catch`:

```ts
import { StepRetriableError } from '@wooksjs/event-wf'

app.step('fetch-data', {
  handler: async (ctx) => {
    try {
      ctx.data = await fetchFromApi()
    } catch (e) {
      throw new StepRetriableError(new Error('API temporarily unavailable'))
    }
  },
})

const output = await app.start('my-flow', {})
if (!output.finished && output.error) {
  await sleep(5000)
  await app.resume(output.state, { input: retryInput })
}
```

Constructor: `originalError: Error` first, then optional `errorList`, `inputRequired`, `expires`.

- `output.retry(input?)` exists on the failed output, but it invokes the raw engine resume outside a WF event context (only `resume` on paused outputs is rewrapped by the adapter), so handlers using composables throw — prefer `app.resume(output.state, ...)`.
- String handlers signal retriable failure by RETURNING the error as a value: `return new StepRetriableError(new Error(...))` — the class is available in the sandbox scope (see [event-wf.md](event-wf.md#string-handlers)). Function handlers may throw it or return it.

---

## Testing

> **Reset the shared router when building apps per-test.** The router is a process-global singleton unless you pass an explicit `Wooks`. Two tests that each `createWfApp()` _inside the test body_ and reuse a step id will silently run the **first** test's handler (first-win) — a green suite hiding a mismatch. Add `beforeEach(() => clearGlobalWooks())` (from `wooks`) so each test gets a fresh router and ids need not be globally unique. (Or set `strictStepIds: true` to make the collision throw.) Not needed when a single module-level app owns all ids, as below. See [event-wf.md](event-wf.md#rules--gotchas).

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
import {
  createHttpOutlet, createOutletHandler, HandleStateStrategy, WfStateStoreMemory,
} from '@wooksjs/event-wf'

const store = new WfStateStoreMemory()
const strategy = new HandleStateStrategy({ store })
const config = { state: strategy, outlets: [createHttpOutlet()] }
const handle = createOutletHandler(wfApp) // wfApp = createWfApp(...) with steps/flows registered

// Start
const runCtx1 = prepareTestHttpContext({
  url: '/wf',
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  rawBody: JSON.stringify({ wfid: 'my-flow' }),
})
const result = await runCtx1(() => handle(config))

// Resume with token
const runCtx2 = prepareTestHttpContext({
  url: '/wf',
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  rawBody: JSON.stringify({ wfs: result.wfs, input: { email: 'a@b.com' } }),
})
const resumed = await runCtx2(() => handle(config))
expect(resumed).toEqual({ finished: true })
```

---

## Low-level Context API

All imported from `@wooksjs/event-wf`. Normal step code uses `useWfState()` — use these only to seed/inspect WF contexts manually (custom drivers, tests):

- `wfKind` — the `'WF'` event kind; slots `schemaId`, `stepId`, `inputContext`, `indexes`, `input` read via `current().get(wfKind.keys.<slot>)`.
- `resumeKey` — boolean slot: `false` on start, `true` on resume; surfaced as `useWfState().resume`.
- `createWfContext(options, seeds, fn)` / `resumeWfContext(options, seeds, fn)` — run `fn` inside a fresh WF event context; `seeds` follows `TWFEventInput` (`{ schemaId, stepId, inputContext, indexes?, input? }`).
- `wfShortcuts` — `{ flow: 'WF_FLOW', step: 'WF_STEP' }`, the router pseudo-methods under which flows and steps are registered and looked up.
