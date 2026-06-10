# @wooksjs/event-wf -- Workflow Core

For outlets (HTTP/email delivery), see [wf-outlets.md](wf-outlets.md). For parent context, spies, error handling, testing, see [wf-advanced.md](wf-advanced.md).

## Contents

- [Mental Model](#mental-model)
- [App Setup](#app-setup) — `createWfApp<T>`, `TWooksWfOptions`
- [Starting and Resuming](#starting-and-resuming) — `start`, `resume`, `TFlowOutput`
- [Defining Steps](#defining-steps) — `app.step`, function & string handlers
- [String Handlers](#string-handlers) — sandbox restrictions
- [Parametric Steps](#parametric-steps) — named params, regex, wildcards, parametric flow IDs
- [Defining Flows](#defining-flows) — `app.flow`, init function
- [Schema Syntax](#schema-syntax) — items, conditions, loops, subflows
- [useWfState](#usewfstate-composable) — `ctx<T>()`, `input<I>()`, `schemaId`, `stepId`, `indexes`, `resume`
- [User Input and Pause/Resume](#user-input-and-pauseresume)
- [State Serialization](#state-serialization)
- [Patterns](#patterns) — calculator, interactive wizard
- [Rules & Gotchas](#rules--gotchas)

## Mental Model

`@wooksjs/event-wf` wraps the `@prostojs/wf` workflow engine, adding composable context
management via `AsyncLocalStorage`. Each workflow execution gets its own isolated context store.

Key principles:

- **Steps are route handlers** -- registered with IDs resolved via the Wooks router, supporting
  parametric IDs (`:param`), wildcards, and regex constraints.
- **Flows are schemas** -- arrays that define execution order with conditions, loops, and branching.
- **Pause and resume** -- workflows can pause for user input and resume from serialized state.
- **String-based handlers** -- step handlers can be JavaScript strings (`'ctx.result += input'`),
  making them storable in databases.
- **Outlets** -- delivery channels (HTTP responses, emails) for pause/resume interactions with
  external systems.

---

## App Setup

### `createWfApp<T>(opts?, wooks?)`

Create a workflow app. Generic `T` is the workflow context type.

```ts
import { createWfApp } from '@wooksjs/event-wf'

const app = createWfApp<{ result: number }>()
```

Pass a second argument to share a Wooks router with another adapter:

```ts
import { createHttpApp } from '@wooksjs/event-http'
const httpApp = createHttpApp()
const wfApp = createWfApp<{ result: number }>({}, httpApp)
```

Or share between two WF apps:

```ts
import { Wooks } from 'wooks'
const wooks = new Wooks()
const app1 = createWfApp({}, wooks)
const app2 = createWfApp({}, wooks)
```

### TWooksWfOptions

- `onNotFound` — handler invoked when `start()`/`resume()` finds no flow for the id.
- `logger` — `TConsoleBase` for adapter logging (duplicate-step warnings, etc.).
- `router` — `{ ignoreTrailingSlash?, ignoreCase?, cacheLimit? }` for the underlying router.
- `strictStepIds` — throw on duplicate `WF_STEP` id instead of warn (default `false`).
- `onError` — consumed only by the protected `onError()` hook for subclasses; `WooksWf` itself never invokes it. Step errors propagate from `start()`/`resume()` — see [wf-advanced.md](wf-advanced.md#error-handling).

Duplicate step ids are not fatal by default — the **first** registration wins, later ones are ignored with a `logger.warn`. Set `strictStepIds: true` to throw instead (see [Rules & Gotchas](#rules--gotchas)).

---

## Starting and Resuming

### `app.start(schemaId, inputContext, opts?)`

Start a new workflow execution.

```ts
const output = await app.start('my-flow', { result: 0 })

const output = await app.start('my-flow', { result: 0 }, {
  input: 5,
  eventContext: current(),
})
```

Parameters:
- `schemaId` -- flow ID registered with `app.flow()`
- `inputContext` -- initial context object (`T`)
- `opts` -- optional `TWfRunOptions`:
  - `input` -- input for the first step (consumed after execution)
  - `spy` -- spy function for observing step execution
  - `cleanup` -- cleanup function called when execution ends
  - `eventContext` -- parent `EventContext` to link to (pass `current()` from an active scope)
  - `strategy` -- `{ name: string }`, initial state strategy name for this run (named-registry outlets). The adapter carries only the name; on pause the post-swap name is reflected on `output.inputRequired.stateStrategy`. See [wf-outlets.md](wf-outlets.md).

### `app.resume(state, opts?)`

Resume a previously paused workflow from saved state.

```ts
const resumed = await app.resume(output.state, { input: userInput })
```

`opts` accepts the same `TWfRunOptions` as `start()`.

### `TFlowOutput<T, I, IR>`

Return type of both `start()` and `resume()` — discriminated by `output.finished`:

- **Finished** — `finished: true`; final context at `output.state.context`.
- **Paused** (waiting for input) — `finished: false` with `inputRequired` (the step's input descriptor or outlet signal), `resume(input)`, optional `expires` / `errorList`.
- **Failed (retriable)** — `finished: false` with `error` (the original `Error`) and `retry(input?)`; produced when a step throws/returns `StepRetriableError` — see [wf-advanced.md](wf-advanced.md#error-handling).
- All variants carry `state` (`{ schemaId, context, indexes, meta? }` — plain JSON, see [State Serialization](#state-serialization)) and `stepId`.

Distinguish paused from failed by checking `output.error`.

### Checking completion

```ts
const output = await app.start('my-flow', { result: 0 })

if (output.finished) {
  console.log('Final result:', output.state.context)
} else if (output.inputRequired) {
  console.log('Workflow paused, needs:', output.inputRequired)
  // Save output.state for later resume
}
```

### Convenience `resume()` on output

```ts
const output = await app.start('login-flow', {})
if (!output.finished && output.resume) {
  const final = await output.resume(userCredentials)
}
```

`output.resume()` re-passes only `spy`/`cleanup` — it does NOT carry forward `eventContext` or `strategy`. If you used those, call `app.resume(output.state, { input, eventContext, strategy })` instead.

---

## Defining Steps

### `app.step(id, opts)`

Register a reusable step.

```ts
app.step('double', {
  handler: (ctx) => { ctx.result *= 2 },
})

app.step('add', {
  input: 'number',
  handler: 'ctx.result += input',
})
```

Parameters:
- `id` -- step identifier. Supports router syntax: `'add/:n'`, `'process/*'`.
- `opts.handler` -- `(ctx: T, input?: I) => void | { inputRequired: IR; expires?: number; errorList?: unknown }` (or return a `StepRetriableError`) -- returning `{ inputRequired }` pauses the workflow; `void` continues. Or a JavaScript string.
- `opts.input` -- optional input type description (string). When present and no input is provided
  at runtime, the workflow pauses to request input.

### Function handlers

Receive workflow context and optional input. Can use composables:

```ts
app.step('process-item', {
  handler: (ctx, input) => {
    ctx.items.push(input)
  },
})

app.step('add/:n', {
  handler: () => {
    const { ctx } = useWfState()
    const context = ctx<{ result: number }>()
    context.result += Number(useRouteParams().get('n'))
  },
})
```

---

## String Handlers

JavaScript expressions evaluated in a restricted sandbox. Access `ctx` (context) and `input`:

```ts
app.step('add', { input: 'number', handler: 'ctx.result += input' })
app.step('set-name', { input: 'string', handler: 'ctx.name = input' })
app.step('multiply', { handler: 'ctx.result *= 2' })
```

Useful when workflow definitions are stored in a database -- serializable and loadable dynamically.

**Sandbox restrictions:** No access to `require`, `import`, `process`, `fs`, `console`, or any
Node.js globals. Scope contains only `ctx`, `input`, and `StepRetriableError` -- return
`new StepRetriableError(new Error(...))` to fail retriably (see [wf-advanced.md](wf-advanced.md#error-handling)).
Use function handlers for anything needing Node.js APIs, imports, async operations, or composables.

---

## Parametric Steps

Step IDs support the same router syntax as HTTP routes.

### Named parameters

```ts
app.step('add/:n', {
  handler: () => {
    const { ctx } = useWfState()
    ctx<{ result: number }>().result += Number(useRouteParams().get('n'))
  },
})

app.flow('calculate', ['add/5', 'add/10', 'add/3'])
```

### Regex-constrained parameters

```ts
app.step('multiply/:factor(\\d+)', {
  handler: () => {
    const { ctx } = useWfState()
    ctx<{ result: number }>().result *= Number(useRouteParams().get('factor'))
  },
})
```

### Wildcard steps

```ts
app.step('log/*', {
  handler: () => {
    const message = useRouteParams().get('*')
    console.log(message)
  },
})

app.flow('verbose', ['log/starting', 'process', 'log/done'])
```

### Parametric flow IDs

```ts
app.flow('process/:type', ['validate', 'transform', 'save'])

await app.start('process/csv', { data: rawData })
await app.start('process/json', { data: rawData })
```

---

## Defining Flows

### `app.flow(id, schema, prefix?, init?)`

Register a flow -- an ordered sequence of steps.

```ts
app.flow('calculate', [
  { id: 'add', input: 5 },
  { id: 'add', input: 2 },
  { id: 'double' },
])
```

Parameters:
- `id` -- flow identifier. Supports router syntax (e.g. `'process/:type'`).
- `schema` -- array of step references, conditions, and loops (see Schema Syntax).
- `prefix` -- optional prefix prepended to step IDs during resolution.
- `init` -- optional async function; runs before EVERY start AND resume of the flow.

### Flow init function

Runs in the workflow context before EVERY start and resume -- use it for lazy setup, not
unconditional context initialization (on resume it re-runs against the restored context).
Guard context writes with `useWfState().resume`:

```ts
app.flow('my-flow', ['step1', 'step2'], '', () => {
  const { ctx, resume } = useWfState()
  if (!resume) ctx<{ result: number }>().result = 0 // don't clobber restored context on resume
})
```

---

## Schema Syntax

Flow schemas are arrays of step references and control structures.

### Schema item forms

A schema (`TWorkflowSchema<T>`) is an array; each item is one of:

- `'step-id'` -- string shorthand for a step reference.
- `{ id, input?, condition? }` -- step reference with static input and/or condition.
- `{ steps, condition?, while? }` -- subflow: nested schema, optionally conditional or looped.
- `{ break: cond }` / `{ continue: cond }` -- loop controls (mutually exclusive).

Conditions are either string expressions (evaluated against the context, see below) or
`(ctx: T) => boolean | Promise<boolean>` functions.

### Step references -- three forms

```ts
// 1. String shorthand
app.flow('f1', ['step1', 'add/5', 'add/10'])

// 2. Object with ID and optional input
app.flow('f2', [
  { id: 'add', input: 5 },
  { id: 'process', input: { key: 'value' } },
])

// 3. Mixed
app.flow('f3', ['step1', { id: 'add', input: 5 }, 'step2'])
```

### Conditional execution

Skip steps or groups based on runtime conditions:

```ts
app.flow('order', [
  'check-inventory',
  { id: 'apply-discount', condition: 'order.total > 100' },
  {
    condition: 'order.type !== "digital"',
    steps: ['pack-item', 'ship-item'],
  },
  'send-confirmation',
])
```

Conditions are JavaScript expressions evaluated against the workflow context. Context properties
are the evaluation scope directly (not via `ctx.` prefix):

```ts
// If context is { result: 5, items: [] }:
// condition: 'result > 3'       -> true
// condition: 'items.length > 0' -> false
```

### Loops (`while`)

Repeat a group of steps while a condition is true:

```ts
app.flow('retry-flow', [
  {
    while: 'attempts < 5 && !success',
    steps: [
      { id: 'attempt' },
      { break: 'success' },
    ],
  },
])
```

Loop constructs:
- `while` -- condition string evaluated before each iteration
- `break` -- condition string; if truthy, exits the loop
- `continue` -- condition string; if truthy, skips to next iteration

### Nested subflows

Group steps for conditional execution or organizational clarity:

```ts
app.flow('deploy', [
  'build',
  {
    condition: 'env === "production"',
    steps: [
      'run-tests',
      'run-security-scan',
      {
        condition: 'securityPassed',
        steps: ['deploy-to-prod', 'notify-team'],
      },
    ],
  },
  {
    condition: 'env === "staging"',
    steps: ['deploy-to-staging'],
  },
])
```

---

## useWfState Composable

Primary composable for accessing workflow execution state from within step handlers.

```ts
import { useWfState } from '@wooksjs/event-wf'

app.step('my-step', {
  handler: () => {
    const { ctx, input, schemaId, stepId, indexes, resume } = useWfState()

    ctx<MyContext>()    // mutable workflow context (type T)
    input<MyInput>()   // current step's input (or undefined)
    schemaId           // flow ID being executed
    stepId()           // normalized '/<id>' of the current step ('/add/5'), null before the first step
    indexes()          // position in schema (for resume tracking)
    resume             // boolean: true if this is a resumed execution
  },
})
```

### `ctx<T>()`

Returns the mutable workflow context shared across all steps:

```ts
app.step('transform', {
  handler: () => {
    const { ctx } = useWfState()
    const context = ctx<{ items: string[]; processed: boolean }>()
    context.items = context.items.map(s => s.toUpperCase())
    context.processed = true
  },
})
```

### `input<I>()`

Returns the input for this step (from schema or from resume):

```ts
app.step('configure', {
  handler: () => {
    const { input } = useWfState()
    const config = input<{ port: number; host: string }>()
    if (config) { /* use the provided input */ }
  },
})
```

---

## User Input and Pause/Resume

When a step declares an `input` type but no input is provided in the schema, the workflow pauses:

```ts
app.step('get-email', {
  input: 'string',
  handler: 'ctx.email = input',
})

app.step('send-welcome', {
  handler: (ctx) => sendEmail(ctx.email, 'Welcome!'),
})

app.flow('onboarding', [
  { id: 'get-email' },    // no input -> workflow pauses
  { id: 'send-welcome' },
])

const output = await app.start('onboarding', {})
// output.finished === false
// output.inputRequired === 'string'  (the step's input descriptor)

const final = await app.resume(output.state, { input: 'user@example.com' })
// final.finished === true
```

### Full pause/resume pattern

```ts
const app = createWfApp<{ username?: string; authenticated?: boolean }>()

app.step('get-credentials', {
  input: '{ username: string, password: string }',
  handler: (ctx, input) => {
    ctx.username = input.username
    ctx.authenticated = validate(input.username, input.password)
  },
})

app.step('welcome', {
  handler: (ctx) => console.log(`Welcome, ${ctx.username}!`),
})

app.flow('login', [{ id: 'get-credentials' }, { id: 'welcome' }])

// Start -- pauses at get-credentials
const output = await app.start('login', {})

// Save state to database
const savedState = JSON.stringify(output.state)

// Later, resume with user input
const state = JSON.parse(savedState)
const final = await app.resume(state, {
  input: { username: 'alice', password: 'secret' },
})
// final.finished === true
```

---

## State Serialization

`output.state` is plain JSON. Serialize for persistence:

```ts
// Save
await db.save('workflow:123', JSON.stringify(output.state))

// Load and resume
const saved = JSON.parse(await db.load('workflow:123'))
const result = await app.resume(saved, { input: userInput })
```

Do not modify the `state` object -- `indexes` tracks the workflow's exact position.

---

## Patterns

### Calculator workflow

```ts
const app = createWfApp<{ result: number }>()

app.step('add', { input: 'number', handler: 'ctx.result += input' })
app.step('multiply', { input: 'number', handler: 'ctx.result *= input' })
app.step('add/:n', {
  handler: () => {
    const { ctx } = useWfState()
    ctx<{ result: number }>().result += Number(useRouteParams().get('n'))
  },
})

app.flow('calculate', [{ id: 'add', input: 10 }, { id: 'multiply', input: 2 }, 'add/5'])

const output = await app.start('calculate', { result: 0 })
// result: (0 + 10) * 2 + 5 = 25
```

### Interactive wizard

```ts
const app = createWfApp<{ name?: string; email?: string; plan?: string }>()

app.step('get-name', { input: 'string', handler: 'ctx.name = input' })
app.step('get-email', { input: 'string', handler: 'ctx.email = input' })
app.step('get-plan', { input: 'string', handler: 'ctx.plan = input' })

app.flow('signup', ['get-name', 'get-email', 'get-plan'])

// Each step pauses for user input
let output = await app.start('signup', {})
output = await app.resume(output.state, { input: 'Alice' })
output = await app.resume(output.state, { input: 'a@b.com' })
output = await app.resume(output.state, { input: 'pro' })
// output.finished === true
```

---

## Rules & Gotchas

| #   | Invariant |
| --- | --------- |
| 1   | Provide `<T>` to `createWfApp<T>()` and `ctx<T>()` for type safety. |
| 2   | `start()` / `resume()` return Promises — `await` them. |
| 3   | Composables must be called inside a step handler (or flow `init`, which runs in context). |
| 4   | String handlers are sandboxed: scope is only `ctx`, `input`, and `StepRetriableError`. No `require`/`import`/`process`/`console`/Node globals. Use function handlers for anything non-trivial. |
| 5   | Step IDs are router paths: `'process/items'` is two segments. Use `'process-items'` for flat IDs. |
| 6   | Step IDs must be unique: re-registering an id is **first-win** (later handler ignored) + a `logger.warn`. Set `strictStepIds: true` to throw instead. |
| 7   | Flow ids throw on duplicate within the same app instance; across apps sharing a router they are first-win like step ids. |
| 8   | Register steps before the flows that reference them — `flow()` validates step ids against the router at registration and throws `Step "/<id>" not found.` otherwise. |
| 9   | The router is a process-global singleton unless you pass an explicit `Wooks`/adapter to `createWfApp`, so step ids collide **across apps too**. In tests, `beforeEach(() => clearGlobalWooks())` (from `wooks`) to reset it — see [wf-advanced.md](wf-advanced.md#testing). |
| 10  | Conditions access context properties directly: `'result > 10'` checks `context.result` (no `ctx.` prefix). |
| 11  | Input is cleared after first step — subsequent steps get input only via `resume()`. |
| 12  | Flow `init` runs before EVERY start and resume — guard context initialization with `useWfState().resume`. |
| 13  | Prefer parametric steps over duplication (`add/:n` vs `add-5`/`add-10`); keep branching in schema conditions, not handler code. |
| 14  | Do not modify `output.state` — `indexes` tracks exact position. |
| 15  | Step errors propagate from `start()`/`resume()` — see [wf-advanced.md](wf-advanced.md#error-handling). |
