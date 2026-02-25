# What are Wooks Workflows?

`@wooksjs/event-wf` is a declarative workflow engine for Node.js. You describe **what** your workflow does — the steps, the order, the conditions — and the engine handles execution, pausing, resuming, and state management.

```ts
import { createWfApp, useWfState } from '@wooksjs/event-wf'

const app = createWfApp<{ approved: boolean; email: string }>()

app.step('review', {
  input: 'approval',             // pauses until input is provided
  handler: () => {
    const { ctx, input } = useWfState()
    ctx<{ approved: boolean }>().approved = input<boolean>() ?? false
  },
})

app.flow('approval-process', [
  'validate',
  'review',                       // ← workflow pauses here
  { condition: 'approved', steps: ['notify-success'] },
  { condition: '!approved', steps: ['notify-rejection'] },
])
```

Workflows are **interruptible**. When a step needs input (from a user, an external API, a queue message), the workflow pauses and returns serializable state. You resume it later with the input — minutes, hours, or days later.

Read [Why Workflows](/wf/why) for the full motivation — the real-world problems that led to this design and why existing approaches fall short.

## Core Concepts

| Concept | What it is |
|---------|-----------|
| **Step** | A named function that does one thing. Steps can accept parameters via routing syntax (`add/:n`) and access shared context through composables. |
| **Flow** | A schema (array) that defines which steps run, in what order, with what conditions. Flows are data, not code. |
| **Context** | A typed object shared across all steps in a single workflow execution. Each execution gets its own isolated context. |
| **Input** | Data provided to a step at runtime. If a step requires input and none is available, the workflow pauses. |

## How It Fits in Wooks

Wooks is an event-processing framework with adapters for different event types: [HTTP requests](/webapp/), [CLI commands](/cliapp/), and **workflows**. All adapters share the same composable architecture — `useRouteParams()`, `useLogger()`, and other composables work identically across all of them.

`@wooksjs/event-wf` is built on top of [@prostojs/wf](https://github.com/prostojs/wf) and adds routing-based step resolution, async-scoped context isolation, and the composable API.
