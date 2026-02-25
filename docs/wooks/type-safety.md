# Type Safety

Wooks provides compile-time type safety with zero runtime overhead. Every primitive — `key`, `cached`, `slot`, `defineEventKind`, `defineWook` — carries its type through the entire system. There are no casts, no `any` escape hatches, and no runtime type checking.

## How It Works

The core mechanism is **type branding**. Each slot stores a phantom type parameter `_T` that TypeScript tracks but JavaScript never sees:

```ts
interface Key<T> {
  readonly _id: number
  readonly _name: string
  readonly _T?: T  // ← phantom type brand, not used at runtime
}
```

When you create a key, TypeScript locks in the type:

```ts
const userId = key<string>('userId')
// userId is Key<string> — TypeScript remembers this everywhere
```

## Typed Get/Set

`EventContext.get()` and `EventContext.set()` extract the type from the accessor:

```ts
get<T>(accessor: Key<T> | Cached<T>): T
set<T>(key: Key<T>, value: T): void
```

Both operations share the same `<T>`, tied to the accessor's type brand. TypeScript enforces consistency automatically:

```ts
const userId = key<string>('userId')

ctx.set(userId, 'abc')    // ✓ string matches Key<string>
ctx.set(userId, 123)      // ✗ Type 'number' is not assignable to 'string'

const id = ctx.get(userId) // id is string — no cast needed
```

## Inferred Factory Types

`cached<T>` and `defineWook<T>` infer their type from the factory function's return value — you never need to spell out the generic:

```ts
// TypeScript infers T = number from the return value
const requestSize = cached((ctx) => {
  const req = ctx.get(httpKind.keys.req)
  return parseInt(req.headers['content-length'] || '0')
})

ctx.get(requestSize) // number — inferred, not annotated
```

The same applies to `defineWook`:

```ts
// TypeScript infers the full return type from the factory
export const useJob = defineWook((ctx) => ({
  getJobId: () => ctx.get(jobKind.keys.jobId),
  getStatus: () => ctx.has(statusKey) ? ctx.get(statusKey) : 'pending',
}))

const { getJobId, getStatus } = useJob()
// getJobId: () => string
// getStatus: () => 'pending' | 'running' | 'done'
```

No manual type annotation. The factory return type flows through `defineWook` and becomes the wook's return type:

```ts
function defineWook<T>(factory: (ctx: EventContext) => T): (ctx?: EventContext) => T
```

## Parameterized Caching

`cachedBy<K, V>` tracks two independent types — the key and the value:

```ts
const headerValue = cachedBy((name: string, ctx) => {
  return ctx.get(httpKind.keys.req).headers[name] || ''
})

headerValue('content-type')  // returns string
headerValue(42)              // ✗ Type 'number' is not assignable to 'string'
```

## Event Kind Schemas

`defineEventKind` uses `slot<T>()` markers to declare a typed schema. Each slot is a zero-cost type brand:

```ts
function slot<T>(): SlotMarker<T>  // returns {} at runtime — purely a type marker
```

When you pass a schema to `defineEventKind`, TypeScript uses **conditional types with `infer`** to transform each `SlotMarker<T>` into a `Key<T>`:

```ts
type EventKind<S> = {
  keys: { [K in keyof S]: S[K] extends SlotMarker<infer V> ? Key<V> : never }
}
```

In practice:

```ts
const jobKind = defineEventKind('job', {
  jobId: slot<string>(),
  payload: slot<unknown>(),
  priority: slot<number>(),
})

// TypeScript infers:
// jobKind.keys.jobId    → Key<string>
// jobKind.keys.payload  → Key<unknown>
// jobKind.keys.priority → Key<number>

ctx.get(jobKind.keys.priority) // number
```

## Seed Validation

`ctx.seed()` enforces that every slot in the schema is provided with the correct type. The seed type is derived from the schema using a mapped conditional type:

```ts
type EventKindSeeds<K> =
  K extends EventKind<infer S>
    ? { [P in keyof S]: S[P] extends SlotMarker<infer V> ? V : never }
    : never
```

This means:

```ts
// ✓ All slots provided with correct types
ctx.seed(jobKind, {
  jobId: 'abc',
  payload: { data: 1 },
  priority: 5,
})

// ✗ Missing 'priority'
ctx.seed(jobKind, {
  jobId: 'abc',
  payload: { data: 1 },
})

// ✗ Wrong type for 'priority'
ctx.seed(jobKind, {
  jobId: 'abc',
  payload: { data: 1 },
  priority: 'high',  // Type 'string' is not assignable to 'number'
})
```

No runtime validation code. The compiler catches mismatches before you run anything.

## Summary

| Primitive | Type mechanism | What it enforces |
|-----------|---------------|-----------------|
| `key<T>()` | Phantom type brand | `get`/`set` must use the same type |
| `cached<T>(fn)` | Inferred from factory return | Read type matches computed type |
| `cachedBy<K,V>(fn)` | Two independent generics | Key and value types from factory signature |
| `slot<T>()` | Type-level marker (zero runtime cost) | Schema slot type for `defineEventKind` |
| `defineEventKind` | Mapped type with `infer` | Transforms `SlotMarker<T>` → `Key<T>` for each slot |
| `defineWook<T>(fn)` | Inferred from factory return | Wook return type matches factory return type |
| `ctx.seed()` | Conditional mapped type | All required slots present with correct types |

All type safety is compile-time only — no runtime checks, no `instanceof`, no validation libraries. The context is a flat `Map<number, unknown>` at runtime, with TypeScript enforcing correctness through generics, phantom types, and conditional type inference.
