# Event Context

::: info
This is an Advanced Guide for Library Maintainers and or curious :smile: developers
:::

## Introduction

The Event Context is a core component of the Wooks event system that allows you to manage and access contextual
data within the execution of an event.
It provides a way to store and retrieve data that is specific to an event,
ensuring that the data remains isolated and accessible only within the scope of that event.

The Event Context is created using the `createEventContext` function, which takes in an initial data object and returns
a set of hooks that can be used to interact with the context.
The context is stored internally and can be accessed synchronously within the runtime of the event.

The context consists of two main parts:

-   `Event` Object: The event object contains information about the current event being executed. It can include properties such as the event type, payload, metadata, and any other relevant data specific to the event.
-   `Options`: The options object provides additional configuration for the event, including the event logger configuration and route parameters if applicable.

By using the `useEventContext` function within an event, you can retrieve the existing event context
and perform operations on it.
It returns a set of hooks that allow you to interact with the context, such as retrieving the context object,
restoring the context, clearing the context, and accessing the event store.

The event `store` is a key feature of the event context. It allows you to store and retrieve data specific to the event.
The store is accessed using the `store` function, which takes in a key representing the property name in the store and returns a hook object.
The hook object provides methods for interacting with the property, such as getting, setting, initializing, and deleting nested values, as well as accessing entries and clearing the store.

The Event Context is designed to provide a convenient and structured way to manage event-specific data and enable communication and data sharing within the scope of an event execution. By leveraging the Event Context, you can build powerful and modular event-driven applications with Wooks.

## Usage

In Wooks, you have the flexibility to define custom stores within your event context to store additional data specific to your application.
This allows you to extend the event context with custom properties and manage them using the store function.
Let's explore how to use custom stores in the event context.

First, you need to define the structure of your custom stores using TypeScript interfaces.
For example, let's define a custom store called `customStore` with a property named `prop1` of type number and custom event data with `customEventField` of type string:
```ts
// defining custom stores for our event context
interface TMyEventStores {
    customStore: {
        prop1?: number
    }
}

// defining custom additional fields to our event data
interface TMyEventCustomData {
    customEventField: string
}
```
Once you have defined your custom stores,
you can create an event context that includes your custom stores by calling the `createEventContext` function with the appropriate types.
Here's an example:
```ts
import { createEventContext } from '@wooksjs/event-core'

createEventContext<TMyEventStores, TMyEventCustomData>({
    event: {
        type: 'MyEvent',
        customEventField: 'event-value' // from TMyEventCustomData
    },
    options: { eventLogger: {} },
    customStore: {}, // from TMyEventStores
})
```

In the above example, we create an event context with the specified custom stores,
an event of type 'MyEvent', and some options including an event logger.

To access and manipulate the data within the custom store,
you can use the store function provided by the Event Context.
Here's an example of how to use the store function:

```ts
import { useEventContext } from '@wooksjs/event-core'

const { store } = useEventContext<TMyEventStores, TMyEventCustomData>()

// Accessing top-level properties in the event context
console.log(store('event').value) // { type: 'MyEvent', customEventField: 'event-value' }

console.log(store('customStore').has('prop1')) // false

// Initializing and accessing a nested property
let a = 1
const getProp1 = () => store('customStore').init('prop1', () => a++)

console.log(getProp1(), a) // 1, 2 (first time)
console.log(getProp1(), a) // 1, 2 (second time the same)
```
In the above example, we access the top-level properties (`event` and `customStore`) using the store function.
We also demonstrate the init method to initialize a nested property (`prop1`) with a default value only if it's undefined.

You can use other methods provided by the store function, such as `get`, `set`, `has`, `del`, `clear`, and `entries`, to further manipulate the data within the custom store.

Additionally, you can create hooks for specific properties within the custom store using the `hook` method.
This allows you to easily access and modify nested properties. Here's an example:

```ts
const prop1Hook = store('customStore').hook('prop1')
prop1Hook.isDefined // true if prop1 !== undefined
prop1Hook.value     // get prop1 value
prop1Hook.value = 6 // set prop1 value
```

In the example above, we create a hook for the `prop1` property within the `customStore`.
The hook provides properties like `isDefined` (indicating whether the property is defined) and `value` (the current value of the property).

Each event-specific library like `@wooksjs/event-http` or `@wooksjs/event-cli`
has its own types for event context and wraps `useEventContext` function
into event specific functions like `useHttpContext` or `useCliContext`
incapsulating the generic types inside of it.

We can do the same for our custom store example:
```ts
function useMyEventContext() {
    return useEventContext<TMyEventStores, TMyEventCustomData>()
}
```

Now we can call `useMyEventContext` and get properly typed context hooks.

That covers the usage of context and the `store` function within the Event Context.
You can now leverage the flexibility of stores to access and manipulate data in your Event Context.
