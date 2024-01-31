# Quick Start Guide

::: warning
Work on Wooks is still in progress. It is already suitable for immediate use for workflows,
but some APIs may still undergo changes.
:::

This guide will help you get started with Wooks Workflows.

## Installation

To install Wooks Workflows, you need to have Node.js and npm (Node Package Manager) installed on your system.
Once you have them set up, you can install Wooks Workflows using the following command:

```bash
npm install wooks @wooksjs/event-wf
```

## Usage

Here's a step-by-step guide to using Wooks Workflows:

### Step 1: Import `createWfApp` factory and create an App instance

Start by importing the necessary modules and creating an instance of the Wooks Workflows adapter:

```ts
import { createWfApp } from '@wooksjs/event-wf'
import { useRouteParams } from '@wooksjs/event-core'

type MyContext = { result: number }

const app = createWfApp<MyContext>()
```

`MyContext` is a type of workflow context, you have to define relevant context type that suits your workflow needs.

### Step 2: Define Workflow Steps

Next, you can define your workflow steps using the `step()` method provided by the Wooks Workflows adapter. The `step()` method allows you to register steps with their respective handlers. You can use routing flexibility to create dynamic workflows based on parameters.

```ts
app.step('add/:n', {
  handler: ctx => {
    ctx.result += Number(useRouteParams().get('n'))
  },
})
```

Here we defind a step `add` with a required parameter `n`. This step adds up `n` to context `result` field.

### Step 3: Define Workflow Flows

With steps defined, you can now create workflow flows using the `flow()` method. You can define sequences of steps, conditional executions, and looping structures within a flow.

```ts
app.flow('adding', [
  'add/5',
  'add/2',
  {
    condition: 'result < 10',
    steps: ['add/3', 'add/4'],
  },
])
```

Here we created a flow named `adding`, which consists of the following steps:

1. add 5
2. add 2
3. if result < 10 then run a **Subflow**

**Subflow**:

1. add 3
2. add 4

### Step 4: Start the Workflow

To start a workflow, you can call the `start()` method of the Wooks Workflows adapter with the name of the flow you wish to run and the initial context.

```ts
const output = await app.start('adding', { result: 0 })
console.log(output.finished) // true
console.log(output.state.context) // { result: 14 }
```

This will start the 'adding' flow with an initial `result` of 0, and follow the steps defined in the flow.

## Next steps

- Learn how to define [parametric steps](/wf/routing#parametric-step-example)
- Find out how to build [flows](/wf/flows)
- Utilize [Conditional subflows](/wf/flows#conditional-subflows)
- Benefit from [Loops](/wf/flows#loops)

😊 Happy workflow designing with Wooks Workflows!
