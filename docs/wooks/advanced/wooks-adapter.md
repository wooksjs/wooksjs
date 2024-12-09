
# Creating a Custom Wooks Adapter for Your Event Type

Wooks is designed to handle various event types beyond just HTTP. You can create custom adapters that provide a similar developer experience for any event-driven scenario — such as workflows, jobs, or specialized protocols. The approach parallels what you’ve seen with the core concepts in `@wooksjs/event-core` and the built-in HTTP adapter.

## Overview

To create a custom adapter, you’ll need to:

1. **Define Event and Context Types:**  
   Describe your event shape (including a `type`) and the state you want to store per-event.
   *(See the [Custom Event Context](/wooks/advanced/custom-context#_1-define-the-event-and-store-interfaces) for patterns and examples.)*

2. **Create Context Functions:**  
   Write functions that create and access the event context using `createAsyncEventContext()` and `useAsyncEventContext()`.  
   *(See the [Custom Event Context](/wooks/advanced/custom-context#_2-create-context-creation-and-usage-functions) for patterns and examples.)*

3. **Write Composables:**  
   Implement composables that use the `store` API (`init`, `get`, `set`, `del`) to interact with event-scoped data.  
   *(See the [Custom Event Context](/wooks/advanced/custom-context#_3-create-composables-using-the-store-api) for patterns and examples.)*

4. **Extend WooksAdapterBase:**  
   Build a class extending `WooksAdapterBase` to:
   - Register event handlers using the Wooks router.
   - Provide a method to trigger events by creating their context, looking up handlers, and executing them.

## Defining Types and Creating the Context

Before coding, you need:

- An **Event Data Interface**, e.g. `TMyEventData`, describing the event fields and `type`.
- A **Context Store Interface**, e.g. `TMyContextStore`, describing the data you’ll store during event handling.

Once you have those interfaces, follow the patterns described in the [Custom Event Context](/wooks/advanced/custom-context) to:

- Implement `createMyContext(data, options)` that sets up the async event context.
- Implement `useMyContext()` that retrieves and manipulates that context.

## Writing Composables

With `useMyContext()` available, create composables that use `store('key')` to manage data. Use `init` for lazy loading and `get`/`set` for reading and updating state.  
*(See the [Working with Stores](/wooks/advanced/wooks-context#working-with-stores) for more on the store pattern.)*

## Extending `WooksAdapterBase`

Your custom adapter will extend `WooksAdapterBase` and:

- Register event handlers, mapping a method like `on('MY_EVENT', routeId, handler)` so that events of type `MY_EVENT` and a given routeId map to a particular handler.
- Provide a method (e.g. `triggerEvent`) to:
  1. Create an event context via `createMyContext()`.
  2. Lookup handlers using the Wooks router.
  3. Execute the handlers inside the event context callback.

### Example Implementation

```ts
import { TEventOptions, useAsyncEventContext, createAsyncEventContext } from '@wooksjs/event-core'
import { WooksAdapterBase, Wooks } from 'wooks'
import type { TWooksHandler } from 'wooks'

// Define event data interface
interface TMyEventData {
  type: 'MY_EVENT'
  payload: unknown
}

// Define context store interface
interface TMyContextStore {
  data?: {
    items?: string[]
  }
}

// Create context
function createMyContext(
  data: Omit<TMyEventData, 'type'>,
  options: TEventOptions
) {
  return createAsyncEventContext<TMyContextStore, TMyEventData>({
    event: {
      ...data,
      type: 'MY_EVENT',
    },
    options,
  })
}

function useMyContext() {
  return useAsyncEventContext<TMyContextStore, TMyEventData>('MY_EVENT')
}

// Example composable
function useMyData() {
  const { store } = useMyContext()
  const dataStore = store('data')
  
  function getItems() {
    return dataStore.init('items', () => {
      // Lazy-load items
      return ['item1', 'item2']
    })
  }

  return { getItems }
}

// Custom adapter
class MyEventAdapter extends WooksAdapterBase {
  /**
   * Register a handler for MY_EVENT with a given routeId.
   * @param routeId Identifies a specific path or command for this event type
   * @param handler The handler function
   */
  public registerEventRoute(routeId: string, handler: TWooksHandler) {
    return this.on('MY_EVENT', routeId, handler)
  }

  /**
   * Trigger event with a given routeId and payload.
   * @param routeId The route identifier to lookup handlers
   * @param payload The event payload
   * @param opts Additional event options (like logger configs)
   */
  public async triggerEvent(
    routeId: string,
    payload: unknown,
    opts?: TEventOptions
  ) {
    const runInContext = createMyContext({ payload }, this.mergeEventOptions(opts))
    return runInContext(async () => {
      // Lookup handlers for this event type and routeId
      const { handlers } = this.getWooks().lookup('MY_EVENT', `/${routeId}`)
      if (handlers && handlers.length > 0) {
        // Execute all matched handlers in context
        for (const handler of handlers) {
          await handler()
        }
      } else {
        // Handle not found scenario
        // e.g. this.getLogger('MyEventAdapter').warn('No handler found for route', routeId)
      }
    })
  }
}
```

## Summary

- **Define event data and store types:** Refer to the [Custom Event Context](/wooks/advanced/custom-context) for details.
- **Create context functions:** `createMyContext()` and `useMyContext()` ensure each event runs within its own typed context.
- **Use composables for logic:** Manage state with the `store` API to keep code clean and testable.
- **Extend WooksAdapterBase:** Integrate with Wooks’ router to map event routes and handle triggers, creating a seamless developer experience similar to HTTP or workflow events.
