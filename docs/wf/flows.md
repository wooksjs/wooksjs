# Flows

A flow is a schema that defines which [steps](/wf/steps) run, in what order, and under what conditions. Flows are **data** — plain arrays you can build, store, and compose.

[[toc]]

## Defining a Flow

```ts
app.flow('flow-id', [ ...steps ])
```

The simplest flow is a sequence of step ids:

```ts
app.step('validate', { handler: (ctx) => { /* ... */ } })
app.step('process', { handler: (ctx) => { /* ... */ } })
app.step('complete', { handler: (ctx) => { /* ... */ } })

app.flow('pipeline', ['validate', 'process', 'complete'])
```

Steps execute top to bottom. Each step receives the same shared context.

## Providing Input to Steps

You can hardcode input for a step directly in the flow schema:

```ts
app.flow('calculate', [
  { id: 'add', input: 5 },
  { id: 'add', input: 10 },
  { id: 'multiply', input: 2 },
])
```

This is useful when the same step is reused with different values across a flow.

## Conditional Steps

Attach a `condition` to skip a step when the condition is false. Conditions are string expressions evaluated against the workflow context:

```ts
app.flow('process-order', [
  'calculate-total',
  { id: 'apply-discount', condition: 'total > 100' },
  'charge-payment',
])
```

`apply-discount` only runs if `context.total > 100`.

## Subflows

A subflow is an anonymous group of steps nested inside a flow. Use subflows to apply a shared condition or loop to multiple steps at once.

```ts
app.flow('onboarding', [
  'create-account',
  {
    steps: ['send-welcome-email', 'schedule-intro-call'],
  },
  'activate',
])
```

Without a condition, a subflow is just a grouping mechanism. It becomes powerful when combined with conditions or loops.

### Conditional Subflows

```ts
app.flow('onboarding', [
  'create-account',
  {
    condition: 'plan === "premium"',
    steps: ['assign-account-manager', 'send-premium-welcome'],
  },
  {
    condition: 'plan !== "premium"',
    steps: ['send-standard-welcome'],
  },
  'activate',
])
```

The entire subflow is skipped if its condition is false.

## Loops

Use `while` instead of `condition` to repeat a subflow as long as the expression is true:

```ts
app.flow('retry-until-success', [
  {
    while: 'attempts < 3 && !success',
    steps: ['attempt-operation', 'check-result'],
  },
  'finalize',
])
```

The subflow repeats until `attempts >= 3` or `success` becomes truthy.

### `break` — Exit a Loop Early

```ts
app.flow('search', [
  {
    while: 'page < maxPages',
    steps: [
      'fetch-page',
      { break: 'found' },          // exit if context.found is truthy
      'increment-page',
    ],
  },
  'return-results',
])
```

When the `break` condition is met, execution jumps past the loop to the next step in the parent flow.

### `continue` — Skip to Next Iteration

```ts
app.flow('process-batch', [
  {
    while: 'index < items.length',
    steps: [
      'load-item',
      { continue: 'item.skip' },    // skip this item, go to next iteration
      'process-item',
      'save-result',
    ],
  },
])
```

When the `continue` condition is met, the remaining steps in the current iteration are skipped and the loop restarts from the top.

## Flow Prefix

If all steps in a flow share a common prefix, you can set it once:

```ts
app.step('order/validate', { handler: (ctx) => { /* ... */ } })
app.step('order/charge', { handler: (ctx) => { /* ... */ } })
app.step('order/fulfill', { handler: (ctx) => { /* ... */ } })

// Instead of:
app.flow('process-order', ['order/validate', 'order/charge', 'order/fulfill'])

// Use a prefix:
app.flow('process-order', ['validate', 'charge', 'fulfill'], 'order')
```

The third argument to `flow()` is prepended to every step id in the schema.

## Flow Initialization

The fourth argument is an `init` callback that runs before the first step, inside the workflow context:

```ts
app.flow('report', ['gather-data', 'format', 'send'], '', async () => {
  const { ctx } = useWfState()
  const context = ctx<ReportContext>()
  context.startedAt = Date.now()
  context.reportId = await generateId()
})
```

Use `init` to set up derived context values or run async setup before the flow starts. Composables like `useWfState()` are available inside `init`.

## Parametric Flows

Flow ids support the same routing syntax as steps:

```ts
app.flow('process/:type', ['validate', 'transform', 'save'])

await app.start('process/json', { data: '...' })
await app.start('process/csv', { data: '...' })
```

## Flow Output

Both `app.start()` and `app.resume()` return a `TFlowOutput` object:

```ts
const output = await app.start('my-flow', initialContext)

output.finished          // true if the flow completed, false if it paused
output.state.context     // the final (or current) context
output.state.schemaId    // the flow id
output.state.indexes     // position in the schema (for resuming)
output.inputRequired     // set if the flow paused for input
output.error             // set if a StepRetriableError was thrown
output.stepResult        // return value of the last executed step
output.resume?.(input)   // shortcut to resume the flow
output.retry?.()         // shortcut to retry a failed step
```

When `finished` is `false`, the flow paused because a step needs input or threw a retriable error. See [Input & Resume](/wf/input-and-resume) for how to continue execution.
