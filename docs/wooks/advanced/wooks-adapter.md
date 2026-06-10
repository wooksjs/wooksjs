
# Creating a Custom Wooks Adapter

Wooks handles various event types beyond just HTTP. You can create custom adapters that provide a familiar developer experience for any event-driven scenario — such as workflows, jobs, or specialized protocols.

## Overview

To create a custom adapter:

1. **Define an Event Kind:**
   Declare the event's typed slots using `defineEventKind` and `slot`.
   *(See [Custom Event Context](/wooks/advanced/custom-context) for patterns and examples.)*

2. **Build Wooks:**
   Implement wooks using `defineWook`, `key`, and `cached` to provide access to event-scoped data.
   *(See [Custom Event Context](/wooks/advanced/custom-context#_3-build-wooks) for examples.)*

3. **Create a Context Factory:**
   Build a function that creates an `EventContext`, seeds it with event-specific data, and returns a runner function.

4. **Extend `WooksAdapterBase`:**
   Build a class that registers event handlers via the router and triggers events using the context factory.

## Step by Step

### 1. Define Event Kind and Wooks

```ts
import {
  defineEventKind,
  slot,
  key,
  defineWook,
} from '@wooksjs/event-core'

// Define the event kind with typed seed slots
const jobKind = defineEventKind('JOB', {
  jobId: slot<string>(),
  payload: slot<unknown>(),
})

// Build wooks for this event type
const jobStatusKey = key<'pending' | 'running' | 'done'>('job.status')

export const useJob = defineWook((ctx) => ({
  getJobId: () => ctx.get(jobKind.keys.jobId),
  getPayload: <T = unknown>() => ctx.get(jobKind.keys.payload) as T,
  getStatus: () => ctx.has(jobStatusKey) ? ctx.get(jobStatusKey) : 'pending',
  setStatus: (s: 'pending' | 'running' | 'done') => ctx.set(jobStatusKey, s),
}))
```

### 2. Create a Context Factory

Every built-in adapter exports a **context factory** that hardcodes the event kind and delegates to `createEventContext`. The factory signature matches `createEventContext(options, kind, seeds, fn)` but omits the `kind` parameter:

```ts
import { createEventContext } from '@wooksjs/event-core'
import type { EventContextOptions, EventKindSeeds } from '@wooksjs/event-core'

export function createJobContext<R>(
  options: EventContextOptions,
  seeds: EventKindSeeds<typeof jobKind>,
  fn: () => R,
): R {
  return createEventContext(options, jobKind, seeds, fn)
}
```

This is the pattern used by all built-in adapters: `createHttpContext`, `createCliContext`, `createWsConnectionContext`, `createWsMessageContext`, `createWfContext`, and `resumeWfContext`. The context factory:
- Accepts `EventContextOptions` (with optional `parent` for nested contexts)
- Accepts typed `seeds` matching the event kind schema
- Runs `fn` inside the seeded `AsyncLocalStorage` context
- Returns `fn`'s return value (sync or async) for span tracking

### 3. Extend `WooksAdapterBase`

```ts
import { WooksAdapterBase, Wooks } from 'wooks'
import type { TWooksHandler } from 'wooks'
import type { TConsoleBase } from '@prostojs/logger'

interface TJobAdapterOptions {
  logger?: TConsoleBase
  onNotFound?: TWooksHandler
}

class WooksJob extends WooksAdapterBase {
  protected logger: TConsoleBase
  protected eventContextOptions: EventContextOptions

  constructor(opts?: TJobAdapterOptions, wooks?: Wooks | WooksAdapterBase) {
    super(wooks, opts?.logger)
    this.logger = opts?.logger || this.getLogger('[wooks-job]')
    this.eventContextOptions = this.getEventContextOptions()
  }

  /** Register a handler for a job route. */
  job<ResType = unknown>(path: string, handler: TWooksHandler<ResType>) {
    return this.on<ResType>('JOB', path, handler)
  }

  /** Trigger a job event. */
  async trigger(path: string, payload: unknown) {
    return createJobContext(
      this.eventContextOptions,
      { jobId: path, payload },
      async () => {
        const { handlers } = this.wooks.lookup('JOB', `/${path}`)
        if (!handlers) {
          throw new Error(`No handler for job: ${path}`)
        }
        for (const handler of handlers) {
          return await handler()
        }
      },
    )
  }
}
```

Key points:
- Call `super(wooks, opts?.logger)` — accepts an optional shared `Wooks` instance or another adapter
- Cache `this.getEventContextOptions()` once in the constructor
- Register handlers with `this.on('JOB', path, handler)` — the first argument is the event method
- In the trigger method, use the context factory and look up handlers via `this.wooks.lookup()`

### Usage

```ts
const app = new WooksJob()

app.job('/process', async () => {
  const { getJobId, getPayload, setStatus } = useJob()

  setStatus('running')
  const data = getPayload<{ items: string[] }>()
  console.log(`Job ${getJobId()}: processing ${data.items.length} items`)

  setStatus('done')
  return { processed: data.items.length }
})

await app.trigger('process', { items: ['a', 'b', 'c'] })
```

## Sharing Context Across Adapters

Adapters can share a single `Wooks` router by passing one adapter into another's constructor:

```ts
import { createHttpApp } from '@wooksjs/event-http'

const http = createHttpApp()
const jobs = new WooksJob({}, http) // shares the same Wooks instance

// HTTP handler that triggers a job
http.post('/submit', async () => {
  return await jobs.trigger('process', { items: ['a', 'b'] })
})
```

## The Wooks Router Instance

All adapters delegate routing to a shared `Wooks` instance — a thin wrapper around [`@prostojs/router`](https://github.com/prostojs/router).

### Global Singleton

When the `wooks` constructor argument is omitted, `WooksAdapterBase` calls `getGlobalWooks()` — a process-global singleton created on first use. Every adapter created without an explicit instance shares this router. The optional `logger` and `routerOpts` arguments only take effect on the call that creates the singleton; later calls return the existing instance unchanged. Use `clearGlobalWooks()` to reset it (useful in tests or dev-mode hot reload):

```ts
import { getGlobalWooks, clearGlobalWooks } from 'wooks'

const wooks = getGlobalWooks() // creates on first call, reuses afterwards
clearGlobalWooks() // next getGlobalWooks() creates a fresh instance
```

### Router Options

To control routing behavior, construct a `Wooks` instance explicitly with `TWooksOptions` and pass it to your adapters:

```ts
import { Wooks } from 'wooks'

const wooks = new Wooks({
  router: {
    ignoreTrailingSlash: true, // `/path` and `/path/` match the same route
    ignoreCase: true,          // case-insensitive route matching
    cacheLimit: 1000,          // max parsed routes to cache
  },
})

const jobs = new WooksJob({}, wooks)
```

### `lookup()` and `lookupHandlers()`

Both resolve handlers for `(method, path)` against an event context (defaults to `current()`), and as a side effect:

- write the matched route params to the context (the `routeParamsKey` slot, read by `useRouteParams()`)
- fire the `ContextInjector` hooks `'Handler:routed'` / `'Handler:not_found'` (see below)

`lookup()` returns `{ handlers, segments, firstStatic, path }` — all fields are `null` on a miss. `lookupHandlers()` is the fast variant: it returns just `TWooksHandler[] | null` without allocating a result object.

`getRouter()` exposes the underlying `ProstoRouter` for direct access.

For HTTP upgrade integration (`httpApp.ws(handler)`), the `WooksUpgradeHandler` type defines the contract a WebSocket-style adapter implements.

## Observability (`ContextInjector`)

`@wooksjs/event-core` ships a no-op `ContextInjector` base class. Subclass it and install your instance globally to add tracing, metrics, or logging around event lifecycle points — e.g. OpenTelemetry spans:

```ts
import { ContextInjector, replaceContextInjector } from '@wooksjs/event-core'

class OtelInjector extends ContextInjector<string> {
  with<T>(name: string, attrs: Record<string, string | number | boolean>, cb: () => T): T {
    return tracer.startActiveSpan(name, (span) => {
      span.setAttributes(attrs)
      try { return cb() } finally { span.end() }
    })
  }
  hook(method: string, name: 'Handler:routed' | 'Handler:not_found', route?: string) {
    // record routing metrics
  }
}

replaceContextInjector(new OtelInjector())
```

- `with(name, attributes, cb)` wraps a callback. The framework wraps every kinded event in `'Event:start'` with `{ eventType }` attributes — which is why adapter callbacks should return their results (sync or async) so the span covers the full handler execution.
- `hook(method, name, route?)` fires on every route lookup: `'Handler:routed'` with the matched route path, or `'Handler:not_found'`.
- `getContextInjector()` returns the installed injector, or `null` until one is installed.
- `resetContextInjector()` removes the installed injector, restoring the no-op default (useful in tests).

## Summary

- **Define an event kind:** `defineEventKind` with `slot<T>()` markers declares your event's typed shape.
- **Build wooks:** Use `defineWook`, `key`, `cached` to provide clean APIs for accessing event-scoped data.
- **Create a context factory:** Export a function `(options, seeds, fn)` that calls `createEventContext(options, kind, seeds, fn)` with the kind hardcoded — the standard pattern across all adapters.
- **Extend `WooksAdapterBase`:** Use `this.on()` to register handlers and `this.wooks.lookup()` to find them. Use the context factory to run handlers inside the event context. **Return results** from callbacks to enable span tracking via [`ContextInjector`](#observability-contextinjector).
