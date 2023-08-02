# Steps

A step is a specific function that can be utilized within flows. This document discusses how to define and interact with steps in Wooks Workflows. 

[[toc]]

## Step Definition

Defining a step is straightforward. Utilize the `app.step()` function to declare a step, as shown below:

```ts
app.step('step-name', {
    // input: ...,
    handler: () => { /* ... */ },
})
```

In this definition, `'step-name'` is the identifier for the step and the `handler` function is what gets executed when the step is called within a flow.

## Using Flow Context

In the context of a step, you can access the state associated with the current workflow by invoking the `useWfState` hook. Here's how to use it:

```ts
import { useWfState } from '@wooksjs/event-wf'

app.step('step-name', {
    // input: ...,
    handler: () => {
        const { ctx } = useWfState()
        const context = ctx<ContextType>() // ContextType should be replaced with the actual context type
    },
})
```
The `useWfState` function returns an object containing the context (`ctx`) of the current flow.

## Parametric Steps

A step can be made parametric by incorporating route parameters in its name. The route parameters can be accessed in the step's handler function using the `useRouteParams` hook, as demonstrated below:

```ts
import { useRouteParams } from '@wooksjs/event-core'

app.step('step-name/:param1/:param2', {
    // input: ...,
    handler: () => {
        const { get } = useRouteParams()
        console.log(get('param1')) // prints value of param1
        console.log(get('param2')) // prints value of param2
    },
})
```
In the example above, `:param1` and `:param2` in the step name are placeholders for the actual parameters.

## Requesting Inputs

There are two ways to request input within a step: statically, where the input is always required, or dynamically, where the input is conditionally required.

A static required input can be defined as a property `input`:

```ts
app.step('step-with-input', {
    input: { ... }, // input schema
    handler: () => { /* ... */ },
})
```

For dynamic or conditional inputs, you can return an `inputRequired` object from the step based on certain conditions:

```ts
import { useWfState } from '@wooksjs/event-wf'

app.step('step-with-input', {
    input: { ... }, // input schema // [!code --]
    handler: () => {
        const { input } = useWfState()
        const myInput = input<InputType>() // get input value
        if (!myInput /* && someInputCondition */) {
            return { inputRequired: { ... } }
        }
    },
})
```

In case the required input is not provided, the flow will be interrupted:

```ts
let output = await app.start('flow-with-input', {})
// the flow was interrupted due to lack of input for step "add"
console.log(output.finished) // false
console.log(output.inputRequired) // input schema
if (output.inputRequired) {
    output = app.resume('my-first-flow', output.state, <some input>) // resuming with input
    // resume shortcut:
    // output = output.resume(<some input>)
}
console.log(output.finished) // true
```

## Handling Retriable Errors

A step can be configured to handle errors that can be retried. In the event of a failure that is retry-able, throw an instance of `StepRetriableError`. Here is an example:

```ts
import { StepRetriableError } from '@wooksjs/event-wf'

app.step('step-with-input', {
    handler: () => {
        throw new StepRetriableError(new Error("test error"))
    },
})
```
Executing this step will interrupt the flow:

```ts
let output = await app.flow('flow-with-resumable-error', {})
console.log(output.finished) // false
console.log(output.error) // "test error"

// to retry we can resume flow:
output = await app.resume('flow-with-resumable-error', output.state)
// retry shortcut:
// output = await output.retry()
```

In this example, the `flow-with-resumable-error` flow is interrupted as soon as the `StepRetriableError` is thrown. The error message can be logged, and the flow can be resumed to retry the step.