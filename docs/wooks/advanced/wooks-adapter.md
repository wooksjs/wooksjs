
# Creating a Custom Wooks Adapter

Wooks handles various event types beyond just HTTP. You can create custom adapters that provide a familiar developer experience for any event-driven scenario — such as workflows, jobs, or specialized protocols.

## Overview

To create a custom adapter:

1. **Define an Event Kind:**
   Declare the event's typed slots using `defineEventKind` and `slot`.
   *(See [Custom Event Context](/wooks/advanced/custom-context) for patterns and examples.)*

2. **Build Composables:**
   Implement composables using `defineWook`, `key`, and `cached` to provide access to event-scoped data.
   *(See [Custom Event Context](/wooks/advanced/custom-context#_3-build-composables) for examples.)*

3. **Extend `WooksAdapterBase`:**
   Build a class that:
   - Registers event handlers using the Wooks router.
   - Provides a method to trigger events by creating their context, looking up handlers, and executing them.

## Extending `WooksAdapterBase`

Your custom adapter extends `WooksAdapterBase` and:

- Registers event handlers via `this.on(method, path, handler)`, mapping your event type and route to a handler.
- Provides a trigger method that:
  1. Creates an `EventContext` and seeds the event kind slots.
  2. Looks up handlers using the Wooks router.
  3. Executes the handlers inside the event context.

### Example Implementation

```ts
import {
  EventContext,
  defineEventKind,
  slot,
  key,
  defineWook,
  run,
} from '@wooksjs/event-core'
import type { EventContextOptions } from '@wooksjs/event-core'
import { WooksAdapterBase, Wooks } from 'wooks'
import type { TWooksHandler } from 'wooks'

// 1. Define event kind
const myEventKind = defineEventKind('MY_EVENT', {
  payload: slot<unknown>(),
})

// 2. Build composables
const itemsKey = key<string[]>('myEvent.items')

export const useMyData = defineWook((ctx) => ({
  getItems: (): string[] => {
    if (ctx.has(itemsKey)) return ctx.get(itemsKey)
    const items = ['item1', 'item2']
    ctx.set(itemsKey, items)
    return items
  },
  getPayload: () => ctx.get(myEventKind.keys.payload),
}))

// 3. Custom adapter
class MyEventAdapter extends WooksAdapterBase {
  private ctxOptions: EventContextOptions

  constructor(wooks?: Wooks) {
    super(wooks)
    this.ctxOptions = this.getEventContextOptions()
  }

  /** Register a handler for a specific route. */
  registerRoute(routeId: string, handler: TWooksHandler) {
    return this.on('MY_EVENT', routeId, handler)
  }

  /** Trigger an event with a given route and payload. */
  async triggerEvent(routeId: string, payload: unknown) {
    const ctx = new EventContext(this.ctxOptions)

    return run(ctx, async () => {
      ctx.attach(myEventKind, { payload })

      const handlers = this.wooks.lookupHandlers('MY_EVENT', `/${routeId}`, ctx)
      if (handlers) {
        for (const handler of handlers) {
          await handler()
        }
      }
    })
  }
}
```

### Usage

```ts
const adapter = new MyEventAdapter()

adapter.registerRoute('/process', () => {
  const { getItems, getPayload } = useMyData()
  console.log('Payload:', getPayload())
  console.log('Items:', getItems())
  return 'done'
})

await adapter.triggerEvent('process', { foo: 'bar' })
```

## Summary

- **Define an event kind:** `defineEventKind` with `slot<T>()` markers declares your event's typed shape.
- **Build composables:** Use `defineWook`, `key`, `cached` to provide clean APIs for accessing event-scoped data.
- **Extend `WooksAdapterBase`:** Use `this.on()` to register handlers and `wooks.lookupHandlers()` to find them. Create an `EventContext`, attach your kind's seeds, and run handlers inside `run(ctx, fn)`.
