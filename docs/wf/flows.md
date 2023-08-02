# Flows

In Wooks Workflows, a "flow" refers to a series of steps or subflows, each with a unique name and an assigned sequence of operations.
You can start, interrupt, resume, and complete flows, saving their current state if necessary for future continuation.

[[toc]]

## Flow Fundamentals

Consider we have the following defined steps:

- `add` increments the result by one.
- `mul2` doubles the result.
- `div2` halves the result.

To construct a flow incorporating these steps, we would write the following:

```ts
import { createWfApp } from '@wooksjs/event-wf'

type MyContext = { result: number }

const app = createWfApp<MyContext>()

app.step('add', { handler: ctx => ctx.result++ })
app.step('mul2', { handler: ctx => ctx.result *= 2 })
app.step('dev2', { handler: ctx => ctx.result /= 2 })

app.flow('my-first-flow', [
    'add', 'mul2', 'add', 'add', 'div2',
])

const output = await app.start('my-first-flow', { result: 0 })
console.log(output.state.context) // { result: 2 }
```
This results in an output of `2` as it follows the sequence: `((1*2+1+1)/2)`.

## Subflows

A subflow is essentially an anonymous flow nested within a parent flow.
Each subflow can be associated with a condition that must be satisfied before its commencement.
If the condition fails, the subflow will be skipped.

Let's illustrate this by grouping two `add` commands into a subflow:

```ts
app.flow('my-first-flow', [
    'add',
    'mul2',
    {
        steps: ['add', 'add']
    },
    'div2',
])
```

Here, irrespective of the conditions, all the steps will be executed.

### Conditional Subflows

To add a condition to the subflow, we adjust the code like so:

```ts
app.flow('my-first-flow', [
    'add',
    'mul2',
    {
        condition: 'result < 5', // [!code ++]
        steps: ['add', 'add']
    },
    'div2',
])
```

With this adjustment, the subflow will only execute if `context.result` is less than `5`.

### Conditional Step

Just like subflow, each individual step can have a condition:

```ts
app.flow('my-first-flow', [
    'add',
    'mul2',
    {
        condition: 'result < 5', // [!code ++]
        id: 'add', // Step Id // [!code ++]
    },
    'div2',
])
```

### Loops

Subflows can be iteratively run through with the `while` property. Here's how:

```ts
app.flow('my-first-flow', [
    'add',
    'mul2',
    {
        while: 'result < 5', // [!code ++]
        steps: ['add', 'add']
    },
    'div2',
])
```

In this case, the subflow will iterate as long as `context.result` remains less than `5`.

## Execution Control

Flow or subflow execution can be managed through special steps:

- `continue` - skips the remaining steps in the current iteration and continues to the next iteration.
- `break` - stops the subflow (loop) and returns control to the parent subflow.

### Breaking the Flow

Here's an example of using `break`:

```ts
app.flow('my-first-flow', [
    'add',
    'mul2',
    {
        while: 'result < 5',
        steps: [
            'add',
            { break: 'result % 2 === 1' },  // [!code ++]
            'add',
        ]
    },
    'div2',
])
```
### Continuing the Flow

The `continue` statement can be used as follows:

```ts
app.flow('my-first-flow', [
    'add',
    'mul2',
    {
        while: 'result < 5',
        steps: [
            'add',
            { continue: 'result % 2 === 1' },  // [!code ++]
            'add',
        ]
    },
    'div2',
])
```

## Managing Flow Interruptions

Some steps may require additional input (user or system). If a step requires such input, it sends an interruption signal.
Then, the flow stops with the `inputRequired` property populated by the step.

Here is an example of how you can handle such scenarios:

```ts
import { createWfApp, useWfState } from '@wooksjs/event-wf'

type MyContext = { result: number }

const app = createWfApp<MyContext>()

app.step('add', {
    handler: () => {
        const { ctx, input } = useWfState()
        const n = input<number>()
        if (typeof n !== 'number') {
            return { inputRequired: 'number' }
        }
        ctx<MyContext>().result += n
    },
})

app.flow('my-first-flow', [
    'add'
])

let output = await app.start('my-first-flow', { result: 0 })
// the flow was interrupted due to lack of input for step "add"
console.log(output.finished) // false
console.log(output.inputRequired) // "number"
if (output.inputRequired) {
    output = app.resume('my-first-flow', output.state, 5) // resuming with input = 5
    // resume shortcut:
    // output = output.resume(5)
}
console.log(output.finished) // true
console.log(output.state.context) // { result: 5 }
```

Alternatively, the input could be defined more simply:

```ts
app.step('add', {
    input: 'number', // [!code ++]
    handler: () => {
        const { ctx, input } = useWfState()
        const n = input<number>()
        if (typeof n !== 'number') { // [!code --]
            return { inputRequired: 'number' } // [!code --]
        } // [!code --]
        ctx<MyContext>().result += n
    },
})
```

## Dealing with Inputs

### Hardcoding Inputs to Flow

We assume that we have a step `add` that requires an input in `number` format. If we want to define a flow, that will always provide a
predefined number for that step, we can do so:
```ts
app.flow('my-first-flow', [
   { id: 'add', input: 5 },
])
```
Now step `add` will be called with 5 as an input all the time.

### Inputs Schema

The Wooks Workflows framework leaves the input formats open-ended, enabling you to design input structures that best fit your workflows. For instance, you could use field metadata like so:

```ts
{
    inputRequired: [
        {
            name: 'username',
            label: 'Login',
            type: 'text',
        },
        {
            name: 'password',
            label: 'Password',
            type: 'password',
        },
    ]
}
```

This could then be passed to the frontend, rendered into a user interface form, with the user's input sent back to the application. The state of the flow can then be restored, and the user's input used to resume the flow. The framework provides complete freedom to users in designing their input schemas.
