# Event Context Management — @wooksjs/event-core

> Core machinery behind the Wooks framework: AsyncLocalStorage-based event context, the context store API, creating custom composables with lazy evaluation and caching. This document is domain-agnostic — it applies equally to HTTP, CLI, workflow, and any custom event adapter built on Wooks.

## Mental Model

Every event in Wooks (an HTTP request, a CLI invocation, a workflow step) gets its own **context store** — an isolated plain object that lives for the duration of that event. The store is held in Node.js `AsyncLocalStorage`, so any function called within the event's async chain can access it without parameter passing.

**Composable functions** (the `use*()` pattern) are the primary way to interact with the store. Each composable reads from or writes to a named section of the store. Values are **computed lazily** — only when first accessed — and then **cached** in the store for the lifetime of the event.

```
Event arrives
  → createAsyncEventContext(storeData)
    → AsyncLocalStorage.run(store, handler)
      → handler calls composables
        → composables call useAsyncEventContext()
          → reads/writes the context store via store() helpers
            → init() computes on first access, returns cached on subsequent calls
```

This architecture means:
- No global mutable state — each event is fully isolated
- No parameter drilling — composables access context from anywhere in the call chain
- No wasted computation — if a handler never reads cookies, they're never parsed
- Composables can call other composables — the caching ensures no redundant work

## Installation

```bash
npm install @wooksjs/event-core
```

Note: You typically don't install `event-core` directly. It's a peer dependency of adapters like `@wooksjs/event-http`, `@wooksjs/event-cli`, etc. But you import from it when creating custom composables.

## The Context Store

### Structure

The context store is a typed object. At its base level (from `event-core`), it has:

```ts
interface TGenericContextStore<CustomEventType = TEmpty> {
  event: CustomEventType & TGenericEvent  // event-specific data + { type, logger?, id? }
  options: TEventOptions                   // logger configuration
  parentCtx?: TGenericContextStore         // parent event context (for nested events)
  routeParams?: Record<string, string | string[]>  // route parameters
}
```

Each adapter extends this with its own sections. For example, an HTTP adapter adds `request`, `cookies`, `status`, etc. **Your custom composables extend it further** by declaring additional typed sections.

### Two-level nesting

The store uses a **two-level key structure**: `store(section).method(key)`.

- **Level 1 (section)**: A named top-level section like `'event'`, `'request'`, `'cookies'`, or your custom `'myFeature'`.
- **Level 2 (key)**: A property within that section, like `'id'`, `'rawBody'`, `'parsedToken'`.

This design keeps sections isolated and typed independently.

## Context Store API

### Accessing the context

```ts
import { useAsyncEventContext } from '@wooksjs/event-core'

const { store, getCtx, getStore, setStore, hasParentCtx, getParentCtx } = useAsyncEventContext()
```

Or in an adapter wrapper (typical usage):

```ts
// Each adapter provides its own typed wrapper, e.g.:
const { store, getCtx } = useMyAdapterContext()
```

### `store(section)` — Section accessor

The primary API. Returns an object with utility methods for one section of the store:

```ts
const section = store('mySection')
// section.init, section.get, section.set, section.has, section.del
// section.hook, section.entries, section.clear, section.value
```

---

### `init(key, getter)` — Lazy initialize (most important method)

**This is the core pattern of the entire framework.** If the value for `key` doesn't exist yet, `init` calls `getter()`, stores the result, and returns it. On subsequent calls, it returns the cached value without calling `getter` again.

```ts
const { init } = store('mySection')

// First call → getter runs, result is stored
const value = init('expensiveResult', () => computeSomethingExpensive())

// Second call → cached value returned, getter is NOT called
const sameValue = init('expensiveResult', () => computeSomethingExpensive())
```

`init()` is what makes composables lazy. Instead of computing at composable creation time, you wrap the computation in `init()` and return a function that calls it:

```ts
// CORRECT: lazy — computation deferred until called
function useMyComposable() {
  const { init } = store('mySection')
  const getExpensiveValue = () => init('expensive', () => compute())
  return { getExpensiveValue }
}

// WRONG: eager — computation runs immediately when composable is called
function useMyComposable() {
  const value = compute()  // runs even if never needed
  return { value }
}
```

---

### `get(key)` — Read a value

Returns the stored value or `undefined` if not set:

```ts
const { get } = store('mySection')
const value = get('someKey')  // T | undefined
```

---

### `set(key, value)` — Write a value

Stores a value directly (no lazy evaluation):

```ts
const { set } = store('mySection')
set('limit', 1024)
```

---

### `has(key)` — Check if a value exists

```ts
const { has } = store('mySection')
if (!has('computed')) {
  // not yet initialized
}
```

---

### `del(key)` — Remove a value

Sets the value to `undefined`:

```ts
const { del } = store('mySection')
del('cached')
```

---

### `hook(key)` — Reactive accessor

Creates an object with a `value` property backed by getter/setter (using `Object.defineProperty`). Useful when you want to pass a reference that other code can read or write reactively:

```ts
const { hook } = store('mySection')
const myHook = hook('status')

// Write
myHook.value = 'active'

// Read
console.log(myHook.value)  // 'active'

// Check if explicitly set
console.log(myHook.isDefined)  // true
```

Hooks are the mechanism behind `useStatus()`, `useSetCookie()`, `useSetHeader()`, and other hookable APIs in the framework. They let you return a reactive reference from a composable that external code (like framework internals) can observe.

---

### `entries()` — List all key-value pairs in a section

```ts
const { entries } = store('mySection')
const all = entries()  // [['key1', value1], ['key2', value2]]
```

---

### `clear()` — Reset a section

Replaces the section with an empty object:

```ts
const { clear } = store('mySection')
clear()
```

---

### `store(section).value` — Direct section access

The `value` property on the section object is a hooked getter/setter for the **entire section object**:

```ts
// Set the entire section
store('routeParams').value = { id: '123', slug: 'hello' }

// Read the entire section
const params = store('routeParams').value  // { id: '123', slug: 'hello' }
```

### Top-level helpers

```ts
const { getCtx, getStore, setStore, hasParentCtx, getParentCtx } = useAsyncEventContext()

getCtx()          // entire context store object
getStore('event') // shortcut: reads a top-level section directly
setStore('event', value)  // shortcut: writes a top-level section directly

hasParentCtx()    // true if this event is nested inside another
getParentCtx()    // access the parent context's helpers (throws if none)
```

## Creating Custom Composables

This is the main reason to understand `event-core`. Custom composables let you encapsulate any domain-specific logic — user fetching, validation, token parsing, feature flags, caching — using the same lazy-evaluated, cached, context-scoped pattern.

### Step 1: Define your store section type

Declare a TypeScript interface for your composable's section of the store. All properties should be optional (they start as `undefined`):

```ts
interface TUserStore {
  user?: {
    current?: { id: string; name: string; role: string } | null
    isAdmin?: boolean
    permissions?: string[]
  }
}
```

### Step 2: Access the context with your type

Use the generic parameter on your adapter's context hook to extend the store type:

```ts
import { useAsyncEventContext } from '@wooksjs/event-core'

function useUser() {
  // The generic parameter merges your type with the base store
  const { store } = useAsyncEventContext<TUserStore>()
  const { init } = store('user')

  // ...
}
```

If you're working within an adapter (e.g., HTTP), use that adapter's typed context hook instead:

```ts
// Inside an HTTP adapter context:
// const { store } = useHttpContext<TUserStore>()
//
// Inside a CLI adapter context:
// const { store } = useCliContext<TUserStore>()
```

### Step 3: Implement lazy-computed properties

Return functions that call `init()` internally. The computation runs only when the function is called, and the result is cached:

```ts
function useUser() {
  const { store } = useAsyncEventContext<TUserStore>()
  const { init } = store('user')

  const currentUser = () =>
    init('current', () => {
      // This runs ONCE, only when currentUser() is first called.
      // Replace with your actual user-fetching logic:
      const token = getTokenFromSomewhere()
      if (!token) return null
      return decodeAndVerify(token)
    })

  const isAdmin = () =>
    init('isAdmin', () => {
      // Calls currentUser() — if already cached, no extra work
      return currentUser()?.role === 'admin'
    })

  const permissions = () =>
    init('permissions', () => {
      const user = currentUser()
      if (!user) return []
      return fetchPermissions(user.id)
    })

  return { currentUser, isAdmin, permissions }
}
```

### Step 4: Use in handlers

```ts
// In any handler, anywhere in the call chain:
const { currentUser, isAdmin } = useUser()
const user = currentUser()  // computed and cached
if (!isAdmin()) {
  // isAdmin() reuses the cached user — no re-computation
  throw new Error('Forbidden')
}
```

### Full Example: Validation composable

```ts
interface TValidationStore {
  validation?: {
    errors?: Record<string, string>
    isValid?: boolean
  }
}

function useValidation() {
  const { store } = useAsyncEventContext<TValidationStore>()
  const { get, set, has } = store('validation')

  function addError(field: string, message: string) {
    const errors = get('errors') || {}
    errors[field] = message
    set('errors', errors)
    set('isValid', false)
  }

  function isValid() {
    // Default to true if no errors added
    return !has('isValid') ? true : get('isValid')!
  }

  function getErrors() {
    return get('errors') || {}
  }

  return { addError, isValid, getErrors }
}
```

### Full Example: Caching composable

```ts
interface TCacheStore {
  cache?: Record<string, unknown>
}

function useEventCache() {
  const { store } = useAsyncEventContext<TCacheStore>()
  const { init, get, set, has, del } = store('cache')

  return {
    // Lazy-cached: fetches once, returns cached on subsequent calls
    cached: <T>(key: string, fetcher: () => T): T => init(key, fetcher) as T,
    get: <T>(key: string) => get(key) as T | undefined,
    set: <T>(key: string, value: T) => set(key, value),
    has: (key: string) => has(key),
    invalidate: (key: string) => del(key),
  }
}

// Usage:
const cache = useEventCache()
const user = cache.cached('user:42', () => db.findUser(42))
// Second call returns cached — db.findUser is NOT called again
const sameUser = cache.cached('user:42', () => db.findUser(42))
```

### Full Example: Hookable composable

Use `hook()` when you need to return a reactive reference that framework code or other composables can read or write:

```ts
interface TFeatureFlagStore {
  flags?: {
    darkMode?: boolean
    betaFeatures?: boolean
  }
}

function useDarkMode() {
  const { store } = useAsyncEventContext<TFeatureFlagStore>()
  return store('flags').hook('darkMode')
  // Returns { value: boolean | undefined, isDefined: boolean }
}

// Usage:
const darkMode = useDarkMode()
darkMode.value = true            // set
console.log(darkMode.value)      // true
console.log(darkMode.isDefined)  // true
```

## Built-in Composables (from event-core)

These ship with `@wooksjs/event-core` and work in any adapter:

### `useEventId()`

Generates a UUID for the current event, lazily on first call:

```ts
import { useEventId } from '@wooksjs/event-core'

const { getId } = useEventId()
console.log(getId())  // '550e8400-e29b-41d4-a716-446655440000'
// Second call returns the same ID
```

### `useRouteParams<T>()`

Access route parameters set by the router:

```ts
import { useRouteParams } from '@wooksjs/event-core'

const { params, get } = useRouteParams<{ id: string }>()
console.log(get('id'))   // '123'
console.log(params)      // { id: '123' }
```

### `useEventLogger(topic?)`

Returns a logger scoped to the current event (tagged with the event ID):

```ts
import { useEventLogger } from '@wooksjs/event-core'

const logger = useEventLogger('my-handler')
logger.log('processing event')
logger.warn('something unusual')
logger.error('something failed')
```

## Creating an Event Context (for adapter authors)

If you're building a custom adapter (not using the built-in HTTP/CLI ones), you create the context using `createAsyncEventContext`:

```ts
import { createAsyncEventContext, useAsyncEventContext } from '@wooksjs/event-core'

// 1. Define your event data and store types
interface TMyEventData {
  payload: unknown
  source: string
}

interface TMyContextStore {
  parsed?: { data?: unknown }
  meta?: Record<string, unknown>
}

// 2. Create a context factory
function createMyContext(data: TMyEventData, options = {}) {
  return createAsyncEventContext<TMyContextStore, TMyEventData>({
    event: {
      ...data,
      type: 'MY_EVENT',  // unique event type identifier
    },
    options,
  })
}

// 3. Create a typed context accessor
function useMyContext() {
  return useAsyncEventContext<TMyContextStore, TMyEventData>('MY_EVENT')
}

// 4. Use it
function handleEvent(data: TMyEventData) {
  const runInContext = createMyContext(data)
  runInContext(() => {
    // Inside here, useMyContext() works
    const { store } = useMyContext()
    const { init } = store('parsed')
    const parsed = init('data', () => JSON.parse(data.payload as string))
    // ...
  })
}
```

### Parent context (nested events)

If `createAsyncEventContext` is called inside an existing event context, the new context automatically gets a reference to the parent:

```ts
const { hasParentCtx, getParentCtx } = useAsyncEventContext()
if (hasParentCtx()) {
  const parent = getParentCtx()
  const parentEvent = parent.getStore('event')
}
```

## `attachHook` — Low-level hook utility

For advanced use cases, `attachHook` lets you attach getter/setter hooks to any object property:

```ts
import { attachHook } from '@wooksjs/event-core'

const obj = { name: 'status' }
attachHook(obj, {
  get: () => store.get('value'),
  set: (v) => store.set('value', v),
})

// Now obj.value is reactive:
obj.value = 42     // calls the setter
console.log(obj.value)  // calls the getter

// Hook a custom property name:
attachHook(obj, { get: () => 'hello' }, 'greeting')
console.log(obj.greeting)  // 'hello'
```

## Best Practices

- **Always use `init()` for computed values** — This is the single most important pattern. It ensures lazy evaluation and caching. Never compute eagerly when the composable is instantiated.

- **Return functions, not values** — Composables should return accessor functions (e.g., `currentUser()` not `currentUser`). This preserves laziness — the value is only computed when the returned function is called.

- **One composable per store section** — Each composable should own one named section of the store. This keeps the type system clean and prevents collisions.

- **Composables can (and should) call other composables** — This is the expected composition pattern. A `useUser()` composable can call `useAuth()` internally. Thanks to `init()` caching, there's zero redundant computation even when multiple composables read the same data.

- **Extend the store type with generics** — Always pass your store type as the generic parameter: `useAsyncEventContext<TMyStore>()`. This gives you full type safety and autocompletion for `store('mySection').init(...)`.

- **Keep computed values idempotent** — The getter passed to `init()` should always produce the same result for the same inputs. It runs exactly once and is cached permanently for the event.

- **Name sections semantically** — Use descriptive section names: `'user'`, `'validation'`, `'cache'`, not `'data1'` or `'temp'`.

## Gotchas

- **Composables must be called within an event context** — Calling any composable outside a context scope (e.g., at module init time, or in an orphaned `setTimeout`) throws: `"Event context does not exist at this point."`.

- **Context is async-chain scoped** — The context is bound to the async execution chain via `AsyncLocalStorage`. If you break the chain (e.g., `setTimeout`, `setImmediate`, event emitters with separate callbacks), the context is lost. Use `AsyncResource.bind()` if you need to preserve context across such boundaries.

- **`init()` caches permanently for the event** — If you call `init('key', getterA)` and later `init('key', getterB)`, `getterB` is never called. The value from `getterA` is returned. This is by design — lazy initialization, not lazy re-computation.

- **Store sections start as `undefined`** — `store('mySection').value` is `undefined` until something writes to it. The first call to `init()`, `set()`, or assignment to `.value` creates the section.

- **Event type validation** — When calling `useAsyncEventContext('MY_EVENT')`, the system verifies the current context has `event.type === 'MY_EVENT'`. If it doesn't match, it checks the parent context. If neither matches, it throws a type mismatch error. This prevents accidentally using an HTTP composable inside a CLI event.

- **Don't hold references across events** — Values from the store are scoped to one event. Don't cache them in module-level variables or closures that outlive the event.
