# Steps

A step is a named, reusable unit of work. You define steps once and reference them by id inside [flows](/wf/flows).

[[toc]]

## Defining a Step

```ts
app.step('step-id', {
  handler: (ctx) => {
    // your logic here
  },
})
```

The `handler` receives the workflow context as its first argument. You can mutate it directly:

```ts
app.step('increment', {
  handler: (ctx) => {
    ctx.counter++
  },
})
```

## Accessing State with `useWfState`

Inside any step handler, call `useWfState()` to access the full workflow execution state:

```ts
import { useWfState } from '@wooksjs/event-wf'

app.step('process', {
  handler: () => {
    const { ctx, input, schemaId, stepId, indexes, resume } = useWfState()

    const context = ctx<MyContext>()   // typed workflow context
    const stepInput = input<string>()  // input provided for this step (if any)
    const flowId = schemaId            // id of the running flow
    const currentStep = stepId()       // id of the current step
    const position = indexes()         // position in the flow schema
    const isResumed = resume           // true if this is a resumed execution
  },
})
```

`useWfState()` works from anywhere in the call stack — it uses `AsyncLocalStorage` under the hood, so you can call it from utility functions, not just directly in the handler.

## Parametric Steps

Step ids support route-style parameters. This lets you create generic steps that receive values through their id.

```ts
import { useRouteParams } from '@wooksjs/event-core'

app.step('add/:n', {
  handler: (ctx) => {
    const n = Number(useRouteParams().get('n'))
    ctx.result += n
  },
})
```

Now you can call this step with different values in your flow:

```ts
app.flow('calculate', ['add/5', 'add/10', 'add/3'])
```

### Supported Routing Patterns

Step ids use [@prostojs/router](https://github.com/prostojs/router) syntax:

| Pattern | Example | Matches |
|---------|---------|---------|
| Static | `validate` | Exactly `validate` |
| Named parameter | `add/:n` | `add/5`, `add/100` |
| Multiple parameters | `move/:from/:to` | `move/inbox/archive` |
| Optional parameter | `log/:level?` | `log` and `log/debug` |
| Wildcard | `notify/*` | `notify/email`, `notify/slack/general` |

Access parameters with `useRouteParams().get('paramName')` — use `get('*')` for wildcard captures.

## String Handlers

For lightweight, serializable steps, you can use a JavaScript expression string instead of a function:

```ts
app.step('add', {
  input: 'number',
  handler: 'ctx.result += input',
})

app.step('double', {
  handler: 'ctx.result *= 2',
})
```

String handlers run in a restricted sandbox with only `ctx` (the workflow context) and `input` (the step input) available. They cannot access Node.js APIs, imports, or composables.

Use string handlers when you need steps to be **serializable** (e.g., stored in a database or sent over the wire). Use function handlers for everything else.

## Step with Required Input

A step can declare that it requires input. If the input is not provided when the step runs, the workflow **pauses** and waits for it.

```ts
app.step('get-approval', {
  input: 'boolean',  // declares that this step needs input
  handler: (ctx) => {
    const { input } = useWfState()
    ctx.approved = input<boolean>() ?? false
  },
})
```

See [Input & Resume](/wf/input-and-resume) for the full pause/resume pattern.

## Handling Retriable Errors

If a step fails but can be retried, throw a `StepRetriableError`:

```ts
import { StepRetriableError } from '@wooksjs/event-wf'

app.step('call-api', {
  handler: async (ctx) => {
    const res = await fetch(ctx.apiUrl)
    if (!res.ok) {
      throw new StepRetriableError(new Error(`API returned ${res.status}`))
    }
    ctx.data = await res.json()
  },
})
```

The workflow pauses with the error available on the output. You can retry by resuming:

```ts
const output = await app.start('my-flow', initialContext)

if (!output.finished && output.error) {
  console.log(output.error.message)  // "API returned 503"
  // retry the failed step:
  const retried = await app.resume(output.state)
  // or shortcut:
  // const retried = await output.retry()
}
```

Regular (non-retriable) errors propagate normally and are thrown from `start()` / `resume()`.
