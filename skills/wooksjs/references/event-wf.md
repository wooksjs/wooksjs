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

```ts
interface TWooksWfOptions {
  onError?: (e: Error) => void
  onNotFound?: TWooksHandler
  onUnknownFlow?: (schemaId: string, raiseError: () => void) => unknown
  logger?: TConsoleBase
  eventOptions?: EventContextOptions // event context options (logger, parent)
  router?: {
    ignoreTrailingSlash?: boolean
    ignoreCase?: boolean
    cacheLimit?: number
  }
}
```

Default error behavior: `console.error` + `process.exit(1)`. Always provide `onError` in production.

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

### `app.resume(state, opts?)`

Resume a previously paused workflow from saved state.

```ts
const resumed = await app.resume(output.state, { input: userInput })
```

`opts` accepts the same `TWfRunOptions` as `start()`.

### `TFlowOutput<T, I, IR>`

Return type of both `start()` and `resume()`. Discriminated union:

```ts
// Finished
interface TFlowFinished<T, IR> {
  finished: true
  state: TFlowState<T>
  stepId: string
}

// Paused (waiting for input)
interface TFlowPaused<T, I, IR> {
  finished: false
  state: TFlowState<T>
  stepId: string
  inputRequired: IR
  resume: (input: I) => Promise<TFlowOutput<T, unknown, IR>>
  expires?: number
  errorList?: unknown
}

// Failed (retriable)
interface TFlowFailed<T, I, IR> {
  finished: false
  state: TFlowState<T>
  stepId: string
  error: Error
  retry: (input?: I) => Promise<TFlowOutput<T, unknown, IR>>
  inputRequired?: IR
  expires?: number
  errorList?: unknown
}

interface TFlowState<T> {
  schemaId: string
  context: T
  indexes: number[]
  meta?: Record<string, unknown>
}
```

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
- `opts.handler` -- function `(ctx: T, input?: I) => void | IR` or a JavaScript string.
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
Node.js globals. Only `ctx` and `input` are available. Use function handlers for anything needing
Node.js APIs, imports, async operations, or composables.

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
- `init` -- optional async function called before the first step executes.

### Flow init function

Runs in the workflow context before any step executes:

```ts
app.flow('my-flow', ['step1', 'step2'], '', () => {
  const { ctx } = useWfState()
  ctx<{ result: number }>().result = 0
})
```

---

## Schema Syntax

Flow schemas are arrays of step references and control structures.

### TWorkflowSchema types

```ts
type TWorkflowSchema<T> = TWorkflowItem<T>[]

type TWorkflowItem<T> =
  | string                          // step ID shorthand
  | TWorkflowStepSchemaObj<T, any>  // step with options
  | TSubWorkflowSchemaObj<T>        // subflow / loop
  | TWorkflowControl<T>            // break / continue

interface TWorkflowStepSchemaObj<T, I> {
  id: string
  input?: I
  condition?: string | TWorkflowStepConditionFn<T>
  steps?: never
}

interface TSubWorkflowSchemaObj<T> {
  condition?: string | TWorkflowStepConditionFn<T>
  while?: string | TWorkflowStepConditionFn<T>
  steps: TWorkflowSchema<T>
  id?: never
}

type TWorkflowControl<T> =
  | { continue: string | TWorkflowStepConditionFn<T>; break?: never }
  | { break: string | TWorkflowStepConditionFn<T>; continue?: never }

type TWorkflowStepConditionFn<T> = (ctx: T) => boolean | Promise<boolean>
```

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
    stepId()           // current step ID
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
// output.inputRequired.type === 'string'

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

- Provide `<T>` to `createWfApp<T>()` and `ctx<T>()` for type safety.
- `start()` / `resume()` return Promises — `await` them.
- Composables must be called inside a step handler (or flow `init`, which runs in context).
- String handlers are sandboxed: only `ctx` and `input` available. No `require`/`import`/`process`/`console`/Node globals. Use function handlers for anything non-trivial.
- Step IDs are router paths: `'process/items'` is two segments. Use `'process-items'` for flat IDs.
- Conditions access context properties directly: `'result > 10'` checks `context.result` (no `ctx.` prefix).
- Input is cleared after first step — subsequent steps get input only via `resume()`.
- Prefer parametric steps over duplication (`add/:n` vs `add-5`/`add-10`).
- Keep branching in schema conditions, not handler code.
- Do not modify `output.state` — `indexes` tracks exact position.
- Default `onError` is `console.error` + `process.exit(1)` — always provide `onError` in production.
