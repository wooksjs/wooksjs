# Core Concepts — @wooksjs/event-wf

> Covers workflow app creation, starting and resuming workflows, how the workflow adapter integrates with the event context system, error handling, spies, testing, and logging.

For the underlying event context store API (`init`, `get`, `set`, `hook`, etc.) and how to create custom composables, see [event-core.md](event-core.md).

## Mental Model

`@wooksjs/event-wf` is the workflow adapter for Wooks. It wraps the `@prostojs/wf` workflow engine, adding composable context management via `AsyncLocalStorage`. Each workflow execution gets its own isolated context store, and step handlers can call composable functions (`useWfState()`, `useRouteParams()`, etc.) from anywhere.

Key principles:

1. **Steps are route handlers** — Steps are registered with IDs that are resolved via the Wooks router, supporting parametric step IDs (`:param`), wildcards, and regex constraints.
2. **Flows are schemas** — Flows define the execution order of steps, with conditions, loops, and branching.
3. **Pause and resume** — Workflows can pause for user input and resume from saved state.
4. **String-based handlers** — Step handlers can be JavaScript strings (e.g., `'ctx.result += input'`), making them storable in databases.

## Installation

```bash
npm install wooks @wooksjs/event-wf
```

## Creating a Workflow App

```ts
import { createWfApp } from '@wooksjs/event-wf'

const app = createWfApp<{ result: number }>()

app.step('increment', {
  handler: (ctx) => {
    ctx.result++
  },
})

app.flow('my-flow', [{ id: 'increment' }])

const output = await app.start('my-flow', { result: 0 })
console.log(output.state.context.result) // 1
```

`createWfApp<T>(opts?, wooks?)` returns a `WooksWf<T>` instance. The generic `T` is the workflow context type.

Options:

```ts
interface TWooksWfOptions {
  onError?: (e: Error) => void // custom error handler
  onNotFound?: TWooksHandler // handler when flow not found
  onUnknownFlow?: (schemaId: string, raiseError: () => void) => unknown
  logger?: TConsoleBase // custom logger
  eventOptions?: EventContextOptions // event context options (logger, parent)
  router?: {
    ignoreTrailingSlash?: boolean
    ignoreCase?: boolean
    cacheLimit?: number
  }
}
```

## Starting a Workflow

### `app.start(schemaId, inputContext, opts?)`

Starts a new workflow execution from the beginning:

```ts
const output = await app.start('my-flow', { result: 0 })

// With options
const output = await app.start(
  'my-flow',
  { result: 0 },
  {
    input: 5,
    eventContext: current(),
  },
)
```

**Parameters:**

- `schemaId` — The flow ID registered with `app.flow()`
- `inputContext` — The initial context object (`T`)
- `opts` — Optional `TWfRunOptions` object:
  - `input` — Input for the first step (consumed after execution)
  - `spy` — Spy function to observe step execution
  - `cleanup` — Cleanup function called when execution ends
  - `eventContext` — Parent `EventContext` to link to. Pass `current()` from within an active event scope (e.g. HTTP handler). The workflow creates a child context with `parent: current()`, so step handlers can access parent composables transparently via parent chain traversal.

**Return value (`TFlowOutput<T, I, IR>`):**

```ts
interface TFlowOutput<T, I, IR> {
  finished: boolean // true if workflow completed
  state: {
    schemaId: string // flow ID
    indexes: number[] // position in schema (for resume)
    context: T // final context state
  }
  inputRequired?: {
    // present if paused for input
    type: string // expected input type
    schemaId: string // step requiring input
  }
  stepResult?: IR // last step's return value
  resume?: (input?: I) => Promise<TFlowOutput<T, I, IR>> // resume function
}
```

### Checking completion

```ts
const output = await app.start('my-flow', { result: 0 })

if (output.finished) {
  console.log('Final result:', output.state.context)
} else if (output.inputRequired) {
  console.log('Workflow paused, needs:', output.inputRequired.type)
  // Save output.state for later resume
}
```

## Resuming a Workflow

### `app.resume(state, opts?)`

Resumes a previously paused workflow from saved state:

```ts
// Resume with user-provided input
const resumed = await app.resume(output.state, { input: userInput })

// Simple retry (no input)
const retried = await app.resume(output.state)
```

The `opts` parameter accepts the same `TWfRunOptions` as `start()` — including `eventContext` to link to the active event context via a parent chain.

### Using the `resume()` function on output

The output object includes a convenience `resume()` method:

```ts
const output = await app.start('login-flow', {})
if (!output.finished && output.resume) {
  const final = await output.resume(userCredentials)
}
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

// Start — pauses at get-credentials because input is required
const output = await app.start('login', {})
// output.finished === false
// output.inputRequired === { type: '{ username: string, password: string }', schemaId: 'get-credentials' }

// Save state (e.g., to database)
const savedState = JSON.stringify(output.state)

// Later, resume with user input
const state = JSON.parse(savedState)
const final = await app.resume(state, { input: { username: 'alice', password: 'secret' } })
// final.finished === true
```

## How Workflow Context Works

When `start()` or `resume()` is called, the adapter creates a workflow-specific event context using `createWfContext` (or `resumeWfContext`). These are context factories that hardcode the `wfKind` and delegate to `createEventContext`:

```
app.start(schemaId, inputContext, opts)
  → createWfContext(ctxOptions, seeds, async () => { ... })
    → createEventContext(ctxOptions, wfKind, seeds, fn)
      → AsyncLocalStorage.run(ctx, handler)
        → router matches flow ID → handler runs
          → workflow engine executes steps sequentially
            → each step can call useWfState(), useRouteParams(), etc.
              → composables call current() from @wooksjs/event-core
                → reads/writes the event context via key/cached accessors
```

When `eventContext` is passed in opts, `ctxOptions` includes `parent: eventContext`, linking the WF context to the parent (e.g. HTTP) via the parent chain.

### The WF Event Kind

The WF adapter defines its event kind with `defineEventKind`. Seeds are passed directly to the context factory:

```ts
// Seeds for createWfContext / resumeWfContext
interface WfSeeds {
  schemaId: string // flow ID being executed
  stepId: string | null // current step ID (set during step execution)
  inputContext: unknown // the workflow context object (T)
  indexes?: number[] // position for resume
  input?: unknown // input for current step
}
```

### Custom Composables for Workflows

Use `defineWook` and `key()` from `@wooksjs/event-core` to create custom composables that store data in the event context:

```ts
import { defineWook, key } from '@wooksjs/event-core'

const startTimeKey = key<number>('wf.metrics.startTime')
const stepCountKey = key<number>('wf.metrics.stepCount')

export const useWorkflowMetrics = defineWook((ctx) => {
  ctx.set(startTimeKey, Date.now())
  ctx.set(stepCountKey, 0)

  return {
    incrementSteps: () => ctx.set(stepCountKey, ctx.get(stepCountKey) + 1),
    getElapsed: () => Date.now() - ctx.get(startTimeKey),
    getStepCount: () => ctx.get(stepCountKey),
  }
})
```

For the full context store API and composable patterns, see the `@wooksjs/event-core` skill.

## Workflow Spies

Spies observe step execution without modifying behavior. Attach globally or per-execution:

### Global spy (all workflows)

```ts
const spy = (event, data) => {
  console.log(`[${event}]`, data)
}

app.attachSpy(spy)

// Later, remove it:
app.detachSpy(spy)
```

### Per-execution spy

```ts
const output = await app.start(
  'my-flow',
  { result: 0 },
  {
    spy: (event, ...args) => {
      if (event === 'step') {
        console.log('Step executed:', args)
      }
    },
  },
)
```

The spy function receives:

- `event` — Event type (e.g., `'step'`)
- Additional arguments vary by event type

## Error Handling

### Default behavior

By default, errors call `console.error` and `process.exit(1)`.

### Custom error handler

```ts
const app = createWfApp({
  onError: (error) => {
    console.error(`Workflow error: ${error.message}`)
    // Don't exit — handle gracefully
  },
})
```

### Errors in workflows

Errors thrown in step handlers propagate up from `app.start()` / `app.resume()`:

```ts
try {
  const output = await app.start('my-flow', { result: 0 })
} catch (error) {
  console.error('Workflow failed:', error.message)
}
```

### `StepRetriableError`

A special error type that signals the workflow can be retried with input:

```ts
import { StepRetriableError } from '@wooksjs/event-wf'

app.step('validate', {
  handler: (ctx) => {
    if (!ctx.token) {
      throw new StepRetriableError('Token required', {
        inputRequired: { type: 'string', schemaId: 'validate' },
      })
    }
  },
})
```

## Sharing the Parent Event Context

By default, `start()` and `resume()` create an isolated event context — step handlers cannot access composables from the calling scope (e.g., HTTP composables). When `eventContext` is passed, the workflow creates a **child context** with a parent link (`parent: current()`) instead of sharing the parent context directly. The child context seeds its own WF slots locally, and slot lookups that are not found in the child automatically traverse the parent chain. This means both WF composables and parent composables (e.g., HTTP) work transparently inside step handlers.

### Use case: accessing HTTP auth data in workflow steps

```ts
import { current } from '@wooksjs/event-core'
import { createHttpApp, useRequest } from '@wooksjs/event-http'
import { createWfApp, useWfState } from '@wooksjs/event-wf'

const wf = createWfApp<{ userId: string; role: string }>()

wf.step('check-permissions', {
  handler: () => {
    const { ctx } = useWfState()
    // useRequest() works because the child context traverses the parent chain
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

- **Inherit** (`eventContext: current()`) when the workflow runs entirely within a single HTTP request and steps need parent composables (auth, headers, cached user data). The child context links to the parent via a parent chain, keeping WF-specific slots isolated while providing transparent access to parent slots.
- **Isolate** (default) when the workflow may pause and resume across different requests, or when it should be testable without a parent context.

## Sharing Router Between Adapters

Multiple adapters can share the same Wooks router:

```ts
import { Wooks } from 'wooks'
import { createWfApp } from '@wooksjs/event-wf'

const wooks = new Wooks()
const app1 = createWfApp({}, wooks)
const app2 = createWfApp({}, wooks) // shares the same routes
```

Or share with another adapter (e.g., HTTP):

```ts
import { createHttpApp } from '@wooksjs/event-http'
import { createWfApp } from '@wooksjs/event-wf'

const httpApp = createHttpApp()
const wfApp = createWfApp({}, httpApp) // shares httpApp's router
```

## Testing

Test workflows by calling `app.start()` directly with explicit contexts:

```ts
import { createWfApp } from '@wooksjs/event-wf'

const app = createWfApp<{ count: number }>()

app.step('increment', {
  handler: (ctx) => {
    ctx.count++
  },
})

app.flow('test-flow', [{ id: 'increment' }, { id: 'increment' }])

// Test:
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

## Logging

Inside a step handler, use the event-scoped logger:

```ts
import { useLogger } from '@wooksjs/event-core'

app.step('process', {
  handler: (ctx) => {
    const logger = useLogger()
    logger.info('Processing...')
    ctx.processed = true
  },
})
```

## Best Practices

- **Use `createWfApp<T>()` with a typed context** — The generic `T` gives type safety for all step handlers and flow output.
- **Use string handlers for storable logic** — When workflows are defined in a database, use string handlers like `'ctx.result += input'`.
- **Use function handlers for complex logic** — When handlers need imports, async operations, or composables, use function handlers.
- **Save state for resume** — `output.state` is serializable. Store it in a database to resume later.
- **Use spies for logging/monitoring** — Don't add logging inside every step; attach a spy instead.
- **Use `flow` init functions** — The optional `init` callback in `app.flow()` runs before the first step, useful for context setup.

## Gotchas

- **Composables must be called within a step handler** (inside the async context). Calling them at module load time throws.
- **`start()` and `resume()` return promises** — Always `await` them.
- **Input is cleared after the first step** — When starting with `input`, it's only available to the first step. Subsequent steps don't see it unless the workflow pauses and resumes with new input.
- **String handlers run in a restricted environment** — They can't access `require`, `import`, `process`, or other Node.js globals. Use function handlers for those.
- **Step resolution uses the router** — Step IDs are looked up via the Wooks router. If a step ID contains `/`, it's treated as path segments for routing.
- **Flow IDs also use routing** — You can have parametric flow IDs like `'process/:type'` and use `useRouteParams()` inside the flow's init function.
