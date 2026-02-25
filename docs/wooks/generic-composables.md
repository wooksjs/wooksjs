# Generic Composables

[What are composables?](/wooks/what#composables)

Wooks provides a set of generic composables that work across all event "flavors" (HTTP, CLI, Workflow, or custom). These composables give you access to core event properties — such as event IDs, logging, and route parameters — regardless of the underlying event type.

[[toc]]

## Overview

These composables are defined in the `@wooksjs/event-core` package, but they are re-exported by the main `wooks` library. You can import them directly from `'wooks'`.

**Example Import:**
```ts
import { useEventId, useLogger, useRouteParams } from 'wooks'
```

## `useEventId()`

**Signature:**
```ts
function useEventId(ctx?: EventContext): {
  getId: () => string
}
```

**Description:**
Provides a unique, per-event identifier. Useful for tracking and correlating logs or data associated with an individual event. The ID is a random UUID, generated lazily on first access and cached for the lifetime of the event.

**Example:**
```ts
const { getId } = useEventId()
console.log('Current Event ID:', getId())
```

## `useLogger()`

**Signature:**
```ts
function useLogger(ctx?: EventContext): Logger
```

**Description:**
Returns the `Logger` instance associated with the current event context. The logger supports standard log methods (`info`, `warn`, `error`, `debug`) and is configured when the event context is created.

*Learn more about [Logging in Wooks](/wooks/advanced/logging) in the advanced section.*

**Example:**
```ts
const logger = useLogger()
logger.debug('Processing request')
logger.error('Something went wrong')
```

## `useRouteParams()`

**Signature:**
```ts
function useRouteParams<
  T extends Record<string, string | string[]> = Record<string, string | string[]>
>(ctx?: EventContext): {
  params: T
  get: <K extends keyof T>(name: K) => T[K]
}
```

**Description:**
Accesses route parameters (e.g., path parameters in HTTP routes, command arguments in CLI mode, etc.). Returns a `params` object and a typed `get()` function to retrieve individual parameters by name.

**Example:**
```ts
const { params, get } = useRouteParams<{ id: string }>()
console.log('Route Params:', params)
console.log('ID Param:', get('id'))
```

## `current()`

**Signature:**
```ts
function current(): EventContext
```

**Description:**
Returns the active `EventContext` for the current async execution scope. This is the low-level primitive that all composables use internally. Most application code should use higher-level composables, but `current()` is available for advanced use cases or when building custom composables.

Throws an error if called outside an event context.

*Learn more about [Event Context](/wooks/advanced/wooks-context) in the advanced section.*

**Example:**
```ts
import { current } from '@wooksjs/event-core'

const ctx = current()
```

## Summary

These generic composables form the foundational layer of Wooks' event-driven approach:

- **`useEventId()`:** Get a unique event identifier.
- **`useLogger()`:** Access the event-scoped logger ([More About Logging in Wooks](/wooks/advanced/logging)).
- **`useRouteParams()`:** Access path or argument parameters for the current event.
- **`current()`:** Directly access the underlying event context for advanced scenarios ([More About Event Context](/wooks/advanced/wooks-context)).
