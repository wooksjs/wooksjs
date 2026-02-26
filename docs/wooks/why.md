# Why Wooks?

## The Core Insight

Every backend framework needs to manage event context — the accumulated state of a request as it flows through your application. Who is the user? What are the route params? What's the body? What are the permissions?

Traditional frameworks treat this as an afterthought:

- **Express / Fastify** let you tack properties onto `req` — an untyped, eagerly-computed bag that grows with every middleware. Want to know the user's role? Hope that `authenticate` middleware ran first and set `req.user`. Want type safety? Manually extend the `Request` interface and trust that reality matches.
- **h3** has a cleaner `event` object, but provides no system for extending it type-safely or computing properties lazily with caching. You end up writing the same ad-hoc patterns.

Wooks treats **event context as the central design problem**. It provides:

- **Typed slots** — declare your context properties with compile-time types, not string keys on a mutable object
- **Lazy computation** — nothing runs until accessed; `cached()` slots compute on first read and cache for the event lifetime
- **Automatic caching** — repeat calls return cached results, no manual memoization needed
- **Type-safe extensibility** — `defineWook()` lets you create composables that extend the context without modifying any global object

The composable API — `useRequest()`, `useBody()`, `useAuthorization()` — is the natural surface that emerges from this system. It's not syntactic sugar over `req` and `res`. It's what proper event context management looks like when used.

## The Origin

We were building backend services while working heavily with Vue's Composition API on the frontend. The contrast was stark.

In Vue, you write `useAuth()` and get back credentials, state, and actions — typed, cached, self-contained. On the backend, you'd pass context objects through every function, parse data eagerly in middleware, and hope the types lined up.

The question was simple: **why can't Vue-style composables exist on the server?**

The answer turned out to be `AsyncLocalStorage`. It gives you per-event context propagation — the same thing that makes `ref()` and `computed()` work in Vue's setup functions, but for async handlers. Once we had that, the pattern mapped directly to any event type: HTTP requests, CLI commands, workflows, and custom events. We called these server-side composables **wooks** — from **w**(eb) (h)**ooks**.

## The Design Decisions

### Lazy by default

Traditional frameworks parse and compute data in middleware before your handler runs. If you reject the event early, you've already paid for work that was never needed. Wooks does nothing until you call a wook. Data is parsed on demand, computed lazily, and cached for the event lifetime. This isn't just an optimization — it makes the code honest about what it actually does.

### No middleware pipeline

Middleware forces you to think about ordering — and if you get the order wrong, bugs are subtle. Wooks have no ordering. They read from context, they write to context, and they can be called from anywhere in the handler or any function it calls. There is no pipeline to break.

### One pattern for everything

HTTP, CLI, and workflows share the same `EventContext`, the same `defineWook`, the same `key`/`cached` primitives. A logging wook works in an HTTP handler, a CLI handler, and a workflow step — unchanged. The framework doesn't care what kind of event triggered the handler — it only cares about what's in the context.

### Types that work

In Wooks, `key<string>('userId')` is a `Key<string>`. `defineWook((ctx) => ({ ... }))` infers the return type. There's no indirection layer between what you write and what TypeScript sees. Every primitive is generic — type safety comes for free, not through schemas or interface extensions.

## When to use Wooks

Wooks fits when you want code that reads like Vue composables — function calls that return typed data, no ceremony. It's a good choice when you need to handle multiple event types (HTTP, CLI, workflows) with a consistent API, when you care about TypeScript ergonomics, or when you want explicit control over what runs per event.
