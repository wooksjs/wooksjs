# Quick Start

This guide walks you through building a complete workflow from scratch.

## Installation

```bash
npm install wooks @wooksjs/event-wf
```

## Step 1: Create the App

Every workflow app starts with `createWfApp`. The generic parameter defines the **context type** — the shared state that all steps in a workflow can read and modify.

```ts
import { createWfApp, useWfState } from '@wooksjs/event-wf'
import { useRouteParams } from '@wooksjs/event-core'

// Define the shape of your workflow context
interface OrderContext {
  items: string[]
  total: number
  discount: number
  status: string
}

const app = createWfApp<OrderContext>()
```

## Step 2: Define Steps

Steps are the building blocks. Each step has an **id** and a **handler** function.

```ts
// A simple step that calculates the total
app.step('calculate-total', {
  handler: (ctx) => {
    ctx.total = ctx.items.length * 10 // $10 per item
  },
})

// A parametric step — the discount percentage comes from the step id
app.step('apply-discount/:percent', {
  handler: (ctx) => {
    const percent = Number(useRouteParams().get('percent'))
    ctx.discount = ctx.total * (percent / 100)
    ctx.total -= ctx.discount
  },
})

// A step that uses the composable API
app.step('finalize', {
  handler: () => {
    const { ctx } = useWfState()
    const context = ctx<OrderContext>()
    context.status = context.total > 0 ? 'ready' : 'empty'
  },
})
```

Note how `apply-discount/:percent` uses route-style parameters — when called as `apply-discount/15`, the `percent` parameter resolves to `"15"`.

## Step 3: Define a Flow

A flow is a schema that wires steps together. It's just an array — the engine executes steps in order.

```ts
app.flow('process-order', [
  'calculate-total',
  {
    condition: 'total > 50',           // only apply discount for orders over $50
    steps: ['apply-discount/10'],
  },
  'finalize',
])
```

## Step 4: Run It

```ts
const output = await app.start('process-order', {
  items: ['shirt', 'pants', 'shoes', 'jacket', 'hat', 'belt'],
  total: 0,
  discount: 0,
  status: '',
})

console.log(output.finished)         // true
console.log(output.state.context)
// { items: [...], total: 54, discount: 6, status: 'ready' }
```

The second argument to `start()` is the initial context. Every step in the flow reads and mutates this same object.

## What Just Happened?

1. `calculate-total` set `total` to 60 (6 items × $10)
2. The condition `total > 50` was true, so `apply-discount/10` ran and subtracted 10% ($6)
3. `finalize` set `status` to `'ready'`

The output includes the full final state under `output.state.context`, and `output.finished` tells you whether the workflow completed or paused for input.

## Next Steps

- [Steps](/wf/steps) — handlers, parametric routing, composables, string handlers
- [Flows](/wf/flows) — conditions, loops, subflows, break/continue
- [Input & Resume](/wf/input-and-resume) — pause workflows for user input, resume later
