# Creating Your Own Event Context (JOB Event)

Let’s walk through a simplified, step-by-step example of creating a custom event context for a fictional "JOB" event. We’ll show how to:

1. Define event and store interfaces
2. Create the event context initialization and usage functions
3. Write composables using the `store` APIs (`init`, `get`, `set`) to manage typed data

This example will help you understand how to build your own event adapters on top of `@wooksjs/event-core`.

## 1. Define the Event and Store Interfaces

First, we describe the event and context store structures. The event will represent a job being processed, and the store will hold job-related state such as job status, results, and metadata.

```ts
import type { TGenericEvent } from '@wooksjs/event-core'

/**
 * Event data for the JOB event.
 * - `type: 'JOB'` identifies the event type.
 * - `jobId` is a unique identifier for the job.
 * - `input` is the data this job should process.
 */
interface TJobEventData extends TGenericEvent {
  type: 'JOB'
  jobId: string
  input: unknown
}

/**
 * Store interface for JOB event.
 * We'll keep a `job` object where we store details about the job:
 *  - `status` (e.g., 'pending', 'running', 'completed')
 *  - `result` to store the output of the job
 *  - `metadata` as a nested object containing arbitrary details
 */
interface TJobContextStore {
  job?: {
    status?: 'pending' | 'running' | 'completed'
    result?: unknown
    metadata?: Record<string, string | number>
  }
}
```

We defined `TJobEventData` and `TJobContextStore`. Note that `job` is an object, allowing us to further manage fields inside it using `init`, `get`, `set` on `store('job')`.

## 2. Create Context Creation and Usage Functions

Next, we create a function to initialize the job context and a helper function to access it.

```ts
import { createAsyncEventContext, useAsyncEventContext, TEventOptions } from '@wooksjs/event-core'

/**
 * Creates a new JOB event context. Call this when a new job event arrives.
 * @param data The event data (jobId and input)
 * @param options Event-level configuration (e.g., logging)
 */
function createJobContext(data: Omit<TJobEventData, 'type'>, options: TEventOptions) {
  return createAsyncEventContext<TJobContextStore, TJobEventData>({
    event: {
      ...data,
      type: 'JOB',
    },
    options,
  })
}

/**
 * Accesses the current JOB event context.
 * Throws an error if the current context is not a JOB event.
 */
function useJobContext() {
  return useAsyncEventContext<TJobContextStore, TJobEventData>('JOB')
}
```

Now we have a `createJobContext()` function to spin up a context when a job starts and `useJobContext()` to retrieve it in any composable or handler.

**Usage Example:**

```ts
const runInContext = createJobContext({ jobId: 'abc123', input: { foo: 'bar' } }, {})
runInContext(() => {
  // Inside this callback, we have access to the JOB context
})
```

## 3. Create Composables Using the `store` API

With `useJobContext()`, we can now create composables that manipulate the store. Since `job` is an object, we will use `init`, `get`, and `set` to manage its fields.

### Composable: Managing Job Status

```ts
function useJobStatus() {
  const { store } = useJobContext()
  const jobStore = store('job')

  /**
   * Initialize the job status if not defined. This ensures we don't run expensive logic twice.
   * Here, we just default it to 'pending' if not set.
   */
  function getStatus() {
    return jobStore.init('status', () => 'pending')
  }

  function setStatus(status: 'pending' | 'running' | 'completed') {
    jobStore.set('status', status)
  }

  return { getStatus, setStatus }
}
```

- `getStatus()` uses `init('status', ...)` to set the status to 'pending' if it’s not already defined.
- `setStatus()` uses `set('status', ...)` to update the status.

### Composable: Storing and Retrieving Job Results

We can store the job result once the processing is done:

```ts
function useJobResult() {
  const { store } = useJobContext()
  const jobStore = store('job')

  function getResult() {
    return jobStore.get('result')
  }

  function setResult(res: unknown) {
    jobStore.set('result', res)
  }

  return { getResult, setResult }
}
```

- `getResult()` simply retrieves the current `result` without initializing anything.
- `setResult()` saves the result.

### Composable: Managing Metadata

We can store arbitrary key-value pairs in `metadata`:

```ts
function useJobMetadata() {
  const { store } = useJobContext()
  const jobStore = store('job')

  /**
   * Initialize metadata as an empty object if not defined.
   */
  function ensureMetadata() {
    return jobStore.init('metadata', () => ({} as Record<string, string | number>))
  }

  function getMetadata(key: string) {
    const metadata = ensureMetadata()
    return metadata[key]
  }

  function setMetadata(key: string, value: string | number) {
    const metadata = ensureMetadata()
    metadata[key] = value
    jobStore.set('metadata', metadata)
  }

  return { getMetadata, setMetadata }
}
```

- `ensureMetadata()` ensures `metadata` is initialized once.
- `getMetadata(key)` and `setMetadata(key, value)` manipulate fields in `metadata`.

## Bringing It All Together

Imagine we receive a JOB event:

```ts
const runInContext = createJobContext({ jobId: 'abc123', input: { foo: 'bar' } }, {})
runInContext(() => {
  const { getStatus, setStatus } = useJobStatus()
  const { setResult } = useJobResult()
  const { setMetadata, getMetadata } = useJobMetadata()

  console.log(getStatus()) // 'pending' (initialized just now)
  setStatus('running')
  console.log(getStatus()) // 'running'

  // After processing the job:
  setResult({ success: true })
  setStatus('completed')

  setMetadata('processedAt', Date.now())
  console.log(getMetadata('processedAt')) // Some timestamp
})
```

Here, we’ve demonstrated:

- **Typing the event and store:** We explicitly defined `TJobEventData` and `TJobContextStore`.
- **Creating context functions:** `createJobContext()` and `useJobContext()` ensure type-safe and context-specific operations.
- **Using `init`, `get`, `set`:** We lazily initialize values (like `status`, `metadata`), retrieve them, and update them as the job progresses.

This pattern can be applied to any type of event in your application.
