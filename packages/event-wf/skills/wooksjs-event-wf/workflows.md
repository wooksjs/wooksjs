# Steps & Flows — @wooksjs/event-wf

> Covers defining steps, defining flows (schemas), workflow schema syntax (conditions, loops, subflows), parametric steps, accessing workflow state with `useWfState`, string-based handlers, user input handling, and `StepRetriableError`.

## Defining Steps

### `app.step(id, opts)`

Registers a reusable step with a unique ID:

```ts
import { createWfApp } from '@wooksjs/event-wf'

const app = createWfApp<{ result: number }>()

// Function handler
app.step('double', {
  handler: (ctx) => { ctx.result *= 2 },
})

// String handler (storable, runs in restricted env)
app.step('add', {
  input: 'number',
  handler: 'ctx.result += input',
})
```

**Parameters:**
- `id` — Step identifier (used in flow schemas to reference this step). Supports router syntax: `'add/:n'`, `'process/*'`, etc.
- `opts.handler` — Either a function `(ctx: T, input?: I) => void | IR` or a JavaScript string.
- `opts.input` — Optional: input type description (string). When present and no input is provided at runtime, the workflow pauses to request input.

### Function handlers

Function handlers receive the workflow context and optional input:

```ts
app.step('process-item', {
  handler: (ctx, input) => {
    // ctx = workflow context (type T)
    // input = step input (type I, from flow schema or resume)
    ctx.items.push(input)
  },
})
```

Function handlers can use composables:

```ts
import { useRouteParams } from '@wooksjs/event-core'
import { useWfState } from '@wooksjs/event-wf'

app.step('add/:n', {
  handler: () => {
    const { ctx } = useWfState()
    const context = ctx<{ result: number }>()
    context.result += Number(useRouteParams().get('n'))
  },
})
```

### String handlers

String handlers are JavaScript expressions evaluated in a restricted sandbox. They have access to `ctx` (context) and `input`:

```ts
app.step('add', {
  input: 'number',
  handler: 'ctx.result += input',
})

app.step('set-name', {
  input: 'string',
  handler: 'ctx.name = input',
})

app.step('multiply', {
  handler: 'ctx.result *= 2',
})
```

String handlers are useful when workflow definitions are stored in a database — they can be serialized and loaded dynamically.

**Restrictions:** String handlers cannot access `require`, `import`, `process`, `fs`, or other Node.js globals. They only see `ctx` and `input`.

## Defining Flows

### `app.flow(id, schema, prefix?, init?)`

Registers a flow (workflow schema) — an ordered sequence of steps:

```ts
app.flow('calculate', [
  { id: 'add', input: 5 },
  { id: 'add', input: 2 },
  { id: 'double' },
])
```

**Parameters:**
- `id` — Flow identifier. Supports router syntax (e.g., `'process/:type'`, `'batch/*'`).
- `schema` — Array of step references, conditions, and loops (see Schema Syntax below).
- `prefix` — Optional prefix prepended to step IDs during resolution.
- `init` — Optional async function called before the first step executes.

### Flow init function

The `init` callback runs in the workflow context before any step executes:

```ts
app.flow('my-flow', ['step1', 'step2'], '', () => {
  const { ctx } = useWfState()
  const context = ctx<{ result: number }>()
  // Modify context before steps run
  context.result = 0
})
```

## Schema Syntax

Flow schemas are arrays of step references and control structures.

### Step references

Three forms for referencing steps in a schema:

```ts
// 1. String shorthand (step ID, optionally with parametric segments)
app.flow('f1', ['step1', 'add/5', 'add/10'])

// 2. Object with ID and optional input
app.flow('f2', [
  { id: 'add', input: 5 },
  { id: 'process', input: { key: 'value' } },
])

// 3. Mixed
app.flow('f3', [
  'step1',
  { id: 'add', input: 5 },
  'step2',
])
```

### Conditional execution

Skip steps or groups based on runtime conditions:

```ts
app.flow('order', [
  'check-inventory',
  // Single step with condition
  { id: 'apply-discount', condition: 'order.total > 100' },
  // Group of steps with condition (subflow)
  {
    condition: 'order.type !== "digital"',
    steps: ['pack-item', 'ship-item'],
  },
  'send-confirmation',
])
```

Conditions are JavaScript expressions evaluated against the workflow context. They have access to all context properties directly (not via `ctx.` prefix — the context is the scope).

```ts
// If context is { result: 5, items: [] }:
// condition: 'result > 3'       → true
// condition: 'items.length > 0' → false
```

### Loops (`while`)

Repeat a group of steps while a condition is true:

```ts
app.flow('retry-flow', [
  {
    while: 'attempts < 5 && !success',
    steps: [
      { id: 'attempt' },
      { break: 'success' },      // break when success is truthy
    ],
  },
])
```

Loop constructs:
- `while` — Condition string evaluated before each iteration
- `break` — Condition string; if truthy, exits the loop
- `continue` — Condition string; if truthy, skips to next iteration

```ts
app.flow('process-batch', [
  {
    while: 'index < items.length',
    steps: [
      { id: 'skip-invalid', continue: '!items[index].valid' },
      { id: 'process-item' },
      { id: 'increment-index' },
    ],
  },
])
```

### Nested subflows

Subflows group steps for conditional execution or organizational clarity:

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

## Parametric Steps

Step IDs support the same router syntax as HTTP routes:

### Named parameters

```ts
app.step('add/:n', {
  handler: () => {
    const { ctx } = useWfState()
    const context = ctx<{ result: number }>()
    context.result += Number(useRouteParams().get('n'))
  },
})

// Use in flow with different values
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

Flows can also have parametric IDs:

```ts
app.flow('process/:type', ['validate', 'transform', 'save'])

// Start with different types
await app.start('process/csv', { data: rawData })
await app.start('process/json', { data: rawData })
```

## Accessing Workflow State

### `useWfState()`

The primary composable for accessing workflow execution state from within step handlers:

```ts
import { useWfState } from '@wooksjs/event-wf'

app.step('my-step', {
  handler: () => {
    const { ctx, input, schemaId, stepId, indexes, resume } = useWfState()

    ctx<MyContext>()      // the workflow context object (type T)
    input<MyInput>()      // the current step's input (or undefined)
    schemaId              // the flow ID being executed
    stepId()              // the current step ID
    indexes()             // position in schema (for resume tracking)
    resume                // boolean: true if this is a resumed execution
  },
})
```

### `ctx<T>()`

Returns the workflow context — the mutable state shared across all steps:

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

Returns the input provided for this step (from the flow schema or from resume):

```ts
app.step('configure', {
  handler: () => {
    const { input } = useWfState()
    const config = input<{ port: number; host: string }>()
    if (config) {
      // Use the provided input
    }
  },
})
```

### Using `useRouteParams()` in steps

For parametric step IDs, use `useRouteParams()` from `@wooksjs/event-core`:

```ts
import { useRouteParams } from '@wooksjs/event-core'

app.step('set/:key/:value', {
  handler: () => {
    const { ctx } = useWfState()
    const { get } = useRouteParams<{ key: string; value: string }>()
    const context = ctx<Record<string, string>>()
    context[get('key')] = get('value')
  },
})

app.flow('setup', ['set/name/Alice', 'set/role/admin'])
```

## User Input & Pause/Resume

When a step declares an `input` type but no input is provided in the schema, the workflow pauses:

```ts
app.step('get-email', {
  input: 'string',           // declares expected input type
  handler: 'ctx.email = input',
})

app.step('send-welcome', {
  handler: (ctx) => sendEmail(ctx.email, 'Welcome!'),
})

app.flow('onboarding', [
  { id: 'get-email' },       // no input provided → workflow pauses
  { id: 'send-welcome' },
])

// Start the workflow
const output = await app.start('onboarding', {})
// output.finished === false
// output.inputRequired.type === 'string'

// Resume with user's email
const final = await app.resume(output.state, { input: 'user@example.com' })
// final.finished === true
```

### Providing input in schema (no pause)

When input is provided in the schema, the step executes immediately:

```ts
app.flow('auto-onboarding', [
  { id: 'get-email', input: 'default@example.com' },  // input provided → no pause
  { id: 'send-welcome' },
])
```

### State serialization

The `output.state` object is plain JSON — serialize it for persistence:

```ts
// Save
await db.save('workflow:123', JSON.stringify(output.state))

// Load and resume
const saved = JSON.parse(await db.load('workflow:123'))
const result = await app.resume(saved, { input: userInput })
```

## StepRetriableError

A special error type for recoverable failures. When thrown, the workflow can be resumed:

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

// Handle retry
try {
  await app.start('my-flow', {})
} catch (error) {
  if (error instanceof StepRetriableError) {
    // Wait and retry
    await sleep(5000)
    await app.resume(error.state, { input: retryInput })
  }
}
```

## Common Patterns

### Pattern: Calculator workflow

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

app.flow('calculate', [
  { id: 'add', input: 10 },
  { id: 'multiply', input: 2 },
  'add/5',
])

const output = await app.start('calculate', { result: 0 })
// result: (0 + 10) * 2 + 5 = 25
```

### Pattern: Conditional processing pipeline

```ts
const app = createWfApp<{
  data: unknown
  format: string
  validated: boolean
  output?: string
}>()

app.step('validate', {
  handler: (ctx) => { ctx.validated = isValid(ctx.data) },
})

app.step('to-json', {
  handler: (ctx) => { ctx.output = JSON.stringify(ctx.data) },
})

app.step('to-csv', {
  handler: (ctx) => { ctx.output = toCsv(ctx.data) },
})

app.flow('export', [
  { id: 'validate' },
  { condition: '!validated', steps: [] },  // early exit if invalid
  { condition: 'format === "json"', steps: ['to-json'] },
  { condition: 'format === "csv"', steps: ['to-csv'] },
])
```

### Pattern: Interactive wizard

```ts
const app = createWfApp<{
  name?: string
  email?: string
  plan?: string
}>()

app.step('get-name', { input: 'string', handler: 'ctx.name = input' })
app.step('get-email', { input: 'string', handler: 'ctx.email = input' })
app.step('get-plan', { input: 'string', handler: 'ctx.plan = input' })
app.step('confirm', {
  handler: (ctx) => {
    console.log(`Name: ${ctx.name}, Email: ${ctx.email}, Plan: ${ctx.plan}`)
  },
})

app.flow('signup', [
  { id: 'get-name' },
  { id: 'get-email' },
  { id: 'get-plan' },
  { id: 'confirm' },
])

// Each step pauses for user input
let output = await app.start('signup', {})
output = await app.resume(output.state, { input: 'Alice' })     // name
output = await app.resume(output.state, { input: 'a@b.com' })   // email
output = await app.resume(output.state, { input: 'pro' })        // plan
// output.finished === true
```

### Pattern: Retry loop

```ts
const app = createWfApp<{ attempts: number; success: boolean; data?: unknown }>()

app.step('attempt', {
  handler: async (ctx) => {
    ctx.attempts++
    try {
      ctx.data = await unreliableApi()
      ctx.success = true
    } catch {
      ctx.success = false
    }
  },
})

app.flow('resilient-fetch', [
  {
    while: 'attempts < 5 && !success',
    steps: [
      { id: 'attempt' },
      { break: 'success' },
    ],
  },
])

const output = await app.start('resilient-fetch', {
  attempts: 0,
  success: false,
})
```

## Best Practices

- **Use typed contexts** — Always provide the generic `<T>` to `createWfApp<T>()` and `ctx<T>()` for type safety.
- **Use string handlers for simple mutations** — `'ctx.result += input'` is cleaner and more portable than a function for trivial operations.
- **Use function handlers for complex logic** — Anything needing composables, async operations, or imports should use function handlers.
- **Use parametric steps** — Instead of creating separate steps for `add/5`, `add/10`, etc., create one `add/:n` step and reference it in flows.
- **Use conditions for branching** — Don't implement branching in step handlers. Use schema-level conditions to keep flow logic declarative.
- **Serialize state for long-running workflows** — Use `output.state` to persist workflow progress to a database.
- **Use spies for observability** — Attach spies for logging, metrics, or debugging rather than adding instrumentation inside steps.

## Gotchas

- **Conditions access context properties directly** — The condition `'result > 10'` checks `context.result`, not a local variable. The entire context is the evaluation scope.
- **Input is only for the first step on start** — When calling `app.start(id, ctx, { input })`, the `input` is consumed by the first step. After that, `input` is cleared. Subsequent steps only get input if the workflow pauses and resumes.
- **String handlers are sandboxed** — No access to Node.js APIs, `require`, `import`, `console`, etc. Only `ctx` and `input` are available.
- **Step IDs are router paths** — A step ID `'process/items'` is treated as two path segments. Use `'process-items'` if you want a flat ID.
- **Flow `init` runs in context** — The init function has access to composables (`useWfState()`, `useRouteParams()`, etc.) because it runs inside the async event context.
- **`resume()` requires the exact state object** — The `state` from `output.state` contains `indexes` that track the workflow's position. Don't modify it.
