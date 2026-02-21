---
name: wooksjs-event-wf
description: Wooks Workflow framework — composable, step-based workflow engine for Node.js. Load when building workflow/process automation with wooks; defining workflow steps and flows; using workflow composables (useWfState, useRouteParams); working with @wooksjs/event-core context store (init, get, set, hook); creating conditional and looping flows; resuming paused workflows; handling user input requirements; using string-based step handlers; attaching workflow spies; working with StepRetriableError; creating custom event context composables for workflows.
---

# @wooksjs/event-wf

A composable workflow framework for Node.js built on async context (AsyncLocalStorage) and `@prostojs/wf`. Define steps and flows as composable units — steps execute sequentially with conditional branching, loops, pause/resume, and user input handling. Context is scoped per workflow execution.

## How to use this skill

Read the domain file that matches the task. Do not load all files — only what you need.

| Domain | File | Load when... |
|--------|------|------------|
| Event context (core machinery) | [event-core.md](event-core.md) | Understanding the context store API (`init`/`get`/`set`/`hook`), creating custom composables, lazy evaluation and caching, building your own `use*()` functions |
| Workflow app setup | [core.md](core.md) | Creating a workflow app, `createWfApp`, starting/resuming workflows, error handling, spies, testing, logging |
| Steps & flows | [workflows.md](workflows.md) | Defining steps (`app.step`), defining flows (`app.flow`), workflow schemas, conditions, loops, user input, parametric steps, `useWfState`, `StepRetriableError`, string-based handlers |

## Quick reference

```ts
import { createWfApp } from '@wooksjs/event-wf'

const app = createWfApp<{ result: number }>()

app.step('add', {
  input: 'number',
  handler: 'ctx.result += input',
})

app.flow('calculate', [
  { id: 'add', input: 5 },
  { id: 'add', input: 2 },
  { condition: 'result < 10', steps: [{ id: 'add', input: 3 }] },
])

const output = await app.start('calculate', { result: 0 })
console.log(output.state.context) // { result: 10 }
```

Key exports: `createWfApp()`, `useWfState()`, `useWFContext()`, `useRouteParams()`, `StepRetriableError`.
