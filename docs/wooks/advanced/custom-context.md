# Creating a Custom Event Context

Let's walk through a step-by-step example of creating a custom event context for a fictional "JOB" event. We'll show how to:

1. Define an event kind with typed slots
2. Create the event context and run handlers inside it
3. Build wooks using `defineWook`, `key`, and `cached`

This example will help you understand how to build your own event types on top of `@wooksjs/event-core`.

## 1. Define the Event Kind

First, declare the shape of the JOB event using `defineEventKind`. Each `slot` becomes a typed key that must be seeded when the context is created.

```ts
import { defineEventKind, slot } from '@wooksjs/event-core'

const jobKind = defineEventKind('JOB', {
  jobId: slot<string>(),
  input: slot<unknown>(),
})
```

This gives us `jobKind.keys.jobId` and `jobKind.keys.input` — typed accessors for reading these values from any context.

## 2. Create Context Functions

Next, create a function that initializes a JOB event context and runs a callback inside it.

```ts
import { createEventContext, current } from '@wooksjs/event-core'
import type { EventContextOptions } from '@wooksjs/event-core'

function runJob<R>(
  data: { jobId: string; input: unknown },
  options: EventContextOptions,
  fn: () => R,
): R {
  return createEventContext(options, jobKind, data, fn)
}
```

Inside the callback passed to `runJob`, all wooks and `current()` calls will have access to the JOB context.

## 3. Build Wooks

With the event kind defined, we can build wooks that read and write job-scoped data.

### Managing Job Status

Use `key<T>` for mutable state that changes during event processing:

```ts
import { key, current, defineWook } from '@wooksjs/event-core'

const jobStatusKey = key<'pending' | 'running' | 'completed'>('job.status')

export const useJobStatus = defineWook((ctx) => ({
  getStatus: () => (ctx.has(jobStatusKey) ? ctx.get(jobStatusKey) : 'pending'),
  setStatus: (status: 'pending' | 'running' | 'completed') => {
    ctx.set(jobStatusKey, status)
  },
}))
```

### Storing Job Results

```ts
const jobResultKey = key<unknown>('job.result')

export const useJobResult = defineWook((ctx) => ({
  getResult: () => (ctx.has(jobResultKey) ? ctx.get(jobResultKey) : undefined),
  setResult: (result: unknown) => {
    ctx.set(jobResultKey, result)
  },
}))
```

### Lazy Computed Data

Use `cached` for values that are derived once from other context data:

```ts
import { cached } from '@wooksjs/event-core'

const jobSummary = cached((ctx) => {
  const jobId = ctx.get(jobKind.keys.jobId)
  const input = ctx.get(jobKind.keys.input)
  return `Job ${jobId}: ${JSON.stringify(input)}`
})

export const useJobSummary = defineWook((ctx) => ({
  getSummary: () => ctx.get(jobSummary),
}))
```

## Bringing It All Together

```ts
const logger = { info: console.log, warn: console.warn, error: console.error, debug: console.debug }

runJob({ jobId: 'abc123', input: { foo: 'bar' } }, { logger }, () => {
  const { getStatus, setStatus } = useJobStatus()
  const { setResult } = useJobResult()
  const { getSummary } = useJobSummary()

  console.log(getStatus())   // 'pending'
  console.log(getSummary())  // 'Job abc123: {"foo":"bar"}'

  setStatus('running')
  console.log(getStatus())   // 'running'

  // After processing:
  setResult({ success: true })
  setStatus('completed')
})
```

Here we've demonstrated:

- **Declaring an event kind:** `defineEventKind` with `slot<T>()` markers defines the typed seed shape.
- **Creating a context:** `createEventContext` seeds the slots and runs the callback.
- **Using wooks:** `defineWook` creates cached wooks; `key<T>` stores mutable state; `cached` derives computed values.

This pattern applies to any custom event type in your application.
