
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
  EventContext,
  defineEventKind,
  slot,
  key,
  defineWook,
  run,
} from '@wooksjs/event-core'
import type { EventContextOptions } from '@wooksjs/event-core'

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

Every built-in adapter follows the same pattern: create an `EventContext`, then return a function that runs a callback inside it using `run()` and `ctx.seed()`.

```ts
function createJobContext(
  data: { jobId: string; payload: unknown },
  options: EventContextOptions,
) {
  const ctx = new EventContext(options)
  return <R>(fn: () => R): R =>
    run(ctx, () =>
      ctx.seed(jobKind, {
        jobId: data.jobId,
        payload: data.payload,
      }, fn)
    )
}
```

This is the same pattern used by `@wooksjs/event-http`, `@wooksjs/event-cli`, and `@wooksjs/event-wf`. The context factory:
- Creates a new `EventContext` with logger options
- Returns a higher-order function that accepts a callback
- Inside, calls `run(ctx, ...)` to bind the context to `AsyncLocalStorage`
- Seeds the event kind slots via `ctx.seed(kind, data, fn)`

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
    const runInContext = createJobContext(
      { jobId: path, payload },
      this.eventContextOptions,
    )

    return runInContext(async () => {
      const { handlers } = this.wooks.lookup('JOB', `/${path}`)
      if (!handlers) {
        throw new Error(`No handler for job: ${path}`)
      }
      for (const handler of handlers) {
        return await handler()
      }
    })
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

## Summary

- **Define an event kind:** `defineEventKind` with `slot<T>()` markers declares your event's typed shape.
- **Build wooks:** Use `defineWook`, `key`, `cached` to provide clean APIs for accessing event-scoped data.
- **Create a context factory:** `new EventContext(options)` + `run(ctx, () => ctx.seed(kind, data, fn))` — the standard pattern across all adapters.
- **Extend `WooksAdapterBase`:** Use `this.on()` to register handlers and `this.wooks.lookup()` to find them. Use the context factory to run handlers inside the event context.
