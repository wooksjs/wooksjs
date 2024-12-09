# Generic Composables

[What are composables?](/wooks/what#what-are-composables)

Wooks provides a set of generic composables that work across all event “flavors” (HTTP, CLI, Workflow, or custom). These composables give you access to core event properties — such as event IDs, logging capabilities, and route parameters — regardless of the underlying event type.

[[toc]]

## Overview

These composables are defined in the `@wooksjs/event-core` package, but they are re-exported by the main `wooks` library. This means you can import them directly from `'wooks'` and use them in any Wooks-based application.

**Example Import:**
```ts
import { useEventId, useEventLogger, useRouteParams } from 'wooks'
```

## `useEventId()`

**Signature:**
```ts
function useEventId(): {
  getId: () => string
}
```

**Description:**
Provides a unique, per-event identifier. This can be useful for tracking and correlating logs or other data associated with an individual event. The ID is generated once per event and cached.

**How It Works:**
- Uses `store('event').init('id', ...)` to generate a random UUID only once per event.
- Subsequent calls return the same ID.

**Example:**
```ts
const { getId } = useEventId()
console.log('Current Event ID:', getId())
```

## `useEventLogger(topic?: string)`

**Signature:**
```ts
function useEventLogger(topic?: string): EventLogger
```

**Description:**
Returns an `EventLogger` instance associated with the current event. The logger inherits the event’s unique ID and configuration (logging level, transports, etc.). If a `topic` is provided, a sub-topic logger is returned, allowing you to categorize logs further.

**How It Works:**
- Fetches `eventLogger` options from the context.
- Uses `useEventId()` internally to tag log messages with the current event’s ID.
- Provides a [`ProstoLogger`](https://github.com/prostojs/logger)-based logger that supports various log levels and transports.

*Learn more about [Logging in Wooks](/wooks/advanced/logging) in advanced section.*

**Example:**
```ts
const eventLogger = useEventLogger('my-feature')
eventLogger.debug('This is a debug log for the current event')
eventLogger.error('An error occurred')
```

You can also retrieve persisted messages if `persistLevel` is set:
```ts
const messages = eventLogger.getMessages()
console.log('Persisted Messages:', messages)
```

## `useRouteParams<T extends object = Record<string, string | string[]>>()`

**Signature:**
```ts
function useRouteParams<T extends object = Record<string, string | string[]>>(): {
  params: T
  get<K extends keyof T>(name: K): T[K]
}
```

**Description:**
Accesses route parameters (e.g., path parameters in HTTP routes, command arguments in CLI mode, etc.). This composable returns an object (`params`) and a `get()` function to retrieve individual parameters by name.

**How It Works:**
- Reads `routeParams` from the event context’s store.
- Ensures strong typing if you provide a generic type parameter `T`.

**Example:**
```ts
const { params, get } = useRouteParams<{ id: string }>()
console.log('Route Params:', params)
console.log('ID Param:', get('id'))
```

## `useAsyncEventContext<S, EventType>()`

**Signature:**
```ts
function useAsyncEventContext<S = TEmpty, EventType = TEmpty>(
  expectedTypes?: string | string[]
): {
  getCtx(): S & TGenericContextStore<EventType>,
  store<K extends keyof S>(key: K): StoreHandle<S[K]>,
  // ...other helpers
}
```

**Description:**
The low-level hook that gives you access to the full context of the current event. While often used internally, it’s available for advanced use cases where you need direct control.

**Key Points:**
- Ensures you’re calling it within a valid event context.
- Allows optionally validating the event type.
- Provides access to `store(key)` for managing event-scoped data and properties.

*Learn more about [Wooks Context](/wooks/advanced/wooks-context) in advanced section.*

**Example:**
```ts
const { getCtx, store } = useAsyncEventContext()
const ctx = getCtx()
console.log('Event Type:', ctx.event.type)
```

## Summary

These generic composables form the foundational layer of Wooks’ event-driven approach:

- **`useEventId()`:** Get a unique event identifier.
- **`useEventLogger()`:** Log messages associated with the current event, with optional sub-topic categorization ([More About Logging in Wooks](/wooks/advanced/logging)).
- **`useRouteParams()`:** Access path or argument parameters for the current event.
- **`useAsyncEventContext()`:** Directly work with the underlying event context for advanced scenarios ([More About Wooks Context](/wooks/advanced/wooks-context)).
