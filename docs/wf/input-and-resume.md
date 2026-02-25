# Input & Resume

Workflows can **pause** when a step needs input and **resume** later with that input. This is the key pattern for interactive workflows — user approvals, form wizards, external callbacks, and anything that can't complete in a single pass.

[[toc]]

## How Pausing Works

A step signals that it needs input in one of two ways:

**Static** — declare `input` on the step definition:

```ts
app.step('get-email', {
  input: 'email',                          // always requires input
  handler: () => {
    const { ctx, input } = useWfState()
    ctx<UserContext>().email = input<string>() ?? ''
  },
})
```

**Dynamic** — return `{ inputRequired }` conditionally from the handler:

```ts
app.step('get-email', {
  handler: () => {
    const { ctx, input } = useWfState()
    const context = ctx<UserContext>()
    const value = input<string>()

    if (!value) {
      return { inputRequired: 'email' }    // pause and ask for input
    }
    context.email = value
  },
})
```

Both approaches cause the workflow to pause if no input was provided. The difference is that static `input` always pauses on first run, while dynamic `inputRequired` lets you decide at runtime.

## Running and Resuming

```ts
// Start the flow — it will pause at 'get-email'
let output = await app.start('registration', { email: '', name: '' })

console.log(output.finished)       // false
console.log(output.inputRequired)  // 'email'
```

The `output.state` object contains everything needed to resume later:

```ts
// Resume with the user's input
output = await app.resume(output.state, { input: 'user@example.com' })

console.log(output.finished)       // true (or false if another step also needs input)
console.log(output.state.context)  // { email: 'user@example.com', name: '' }
```

There's also a shortcut on the output object:

```ts
output = await output.resume('user@example.com')
```

## Multi-Step Input Collection

A flow can pause multiple times — once at each step that needs input:

```ts
app.step('ask-name', {
  input: 'name',
  handler: () => {
    const { ctx, input } = useWfState()
    ctx<FormData>().name = input<string>() ?? ''
  },
})

app.step('ask-email', {
  input: 'email',
  handler: () => {
    const { ctx, input } = useWfState()
    ctx<FormData>().email = input<string>() ?? ''
  },
})

app.step('ask-plan', {
  input: 'plan',
  handler: () => {
    const { ctx, input } = useWfState()
    ctx<FormData>().plan = input<string>() ?? 'free'
  },
})

app.flow('signup', ['ask-name', 'ask-email', 'ask-plan', 'create-account'])
```

Running this flow:

```ts
let output = await app.start('signup', { name: '', email: '', plan: '' })
// paused at 'ask-name', inputRequired: 'name'

output = await output.resume('Alice')
// paused at 'ask-email', inputRequired: 'email'

output = await output.resume('alice@example.com')
// paused at 'ask-plan', inputRequired: 'plan'

output = await output.resume('premium')
// finished: true
// context: { name: 'Alice', email: 'alice@example.com', plan: 'premium' }
```

## Hardcoding Input in Flows

If you know the input value ahead of time, provide it in the flow schema to skip the pause:

```ts
app.flow('auto-signup', [
  { id: 'ask-name', input: 'System User' },
  { id: 'ask-email', input: 'system@internal.dev' },
  { id: 'ask-plan', input: 'enterprise' },
  'create-account',
])

// Runs to completion without pausing
const output = await app.start('auto-signup', { name: '', email: '', plan: '' })
console.log(output.finished) // true
```

## Rich Input Schemas

The `inputRequired` value can be anything — a string, an object, an array. Design it to match what your frontend or caller needs:

```ts
app.step('login', {
  handler: () => {
    const { input } = useWfState()
    const credentials = input<{ username: string; password: string }>()

    if (!credentials) {
      return {
        inputRequired: [
          { name: 'username', label: 'Username', type: 'text' },
          { name: 'password', label: 'Password', type: 'password' },
        ],
      }
    }

    // process credentials...
  },
})
```

The caller (e.g., a frontend) receives `output.inputRequired`, renders a form, and calls `resume()` with the collected data.

## Persisting State

`output.state` is a plain, serializable object. You can save it to a database and resume the workflow in a different process, on a different server, or days later:

```ts
// Save state when the workflow pauses
const output = await app.start('onboarding', initialContext)
if (!output.finished) {
  await db.save('workflow:123', JSON.stringify(output.state))
}

// Later — restore and resume
const saved = JSON.parse(await db.get('workflow:123'))
const output = await app.resume(saved, { input: userInput })
```

The state object contains:
- `schemaId` — which flow is running
- `context` — the current context snapshot
- `indexes` — the exact position in the flow schema

This is everything the engine needs to pick up exactly where it left off.

## Retrying Failed Steps

When a step throws a `StepRetriableError`, the workflow pauses the same way — but instead of `inputRequired`, you get `error`:

```ts
const output = await app.start('pipeline', context)

if (!output.finished && output.error) {
  console.log('Step failed:', output.error.message)

  // Retry the same step (no input needed)
  const retried = await app.resume(output.state)
  // or use the shortcut:
  const retried = await output.retry()
}
```

You can also provide new input when retrying, or add delay/backoff logic in your application code before calling `resume()`.

## Spies — Observing Execution

Attach a spy to observe step execution in real time. This is useful for logging, monitoring, or building progress indicators.

```ts
// Global spy — called for every workflow execution
app.attachSpy((event, ...args) => {
  console.log(`[${event}]`, ...args)
})

// Per-execution spy — only for this specific run
const output = await app.start('my-flow', context, {
  spy: (event, ...args) => {
    if (event === 'step') {
      console.log('Step executed:', args[0])
    }
  },
})

// Remove a global spy
app.detachSpy(spy)
```

Spy events let you track which steps ran, in what order, and with what results — without modifying your step handlers.
