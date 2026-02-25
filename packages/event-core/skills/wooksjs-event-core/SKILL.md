---
name: wooksjs-event-core
description: Use this skill when working with @wooksjs/event-core — to create typed context slots with key(), build lazy cached computations with cached() and cachedBy(), define composables with defineWook(), define event kind schemas with defineEventKind() and slot(), manage EventContext lifecycle with run()/current()/createEventContext(), or build custom Wooks adapters. Covers useLogger(), useRouteParams(), useEventId(), and AsyncLocalStorage-based context propagation.
---

# @wooksjs/event-core

Typed, per-event context with lazy cached computations, composable API (`defineWook`), and `AsyncLocalStorage` propagation. The foundation layer for all `@wooksjs` adapters (HTTP, CLI, workflows).

## How to use this skill

Read the domain file that matches the task. Do not load all files — only what you need.

| Domain                | File                             | Load when...                                                                                                              |
| --------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Core concepts & setup | [core.md](core.md)               | Starting a new project, understanding the mental model, seeing all exports                                                |
| Primitives            | [primitives.md](primitives.md)   | Creating typed slots (`key`), lazy computations (`cached`, `cachedBy`), or event kind schemas (`slot`, `defineEventKind`) |
| Composables           | [composables.md](composables.md) | Building custom composables with `defineWook`, using built-in composables (`useRouteParams`, `useEventId`, `useLogger`)   |
| Context & runtime     | [context.md](context.md)         | Managing `EventContext` lifecycle, `run`/`current`/`createEventContext`, async propagation, performance optimization      |

## Quick reference

```ts
import {
  // primitives
  key,
  cached,
  cachedBy,
  slot,
  defineEventKind,
  defineWook,
  // context
  EventContext,
  run,
  current,
  tryGetCurrent,
  createEventContext,
  // composables
  useRouteParams,
  useEventId,
  useLogger,
  // standard keys
  routeParamsKey,
  eventTypeKey,
  // observability
  ContextInjector,
  getContextInjector,
  replaceContextInjector,
} from '@wooksjs/event-core'
```
