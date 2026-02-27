# Why Wooks?

## The Core Insight

Every backend framework needs to manage event context — the accumulated state of a request as it flows through your app. Who is the user? What are the route params? What's in the body? What permissions do they have?

Most frameworks treat this as an afterthought:

- **Express / Fastify** let you tack properties onto `req` — an untyped grab bag that grows with every middleware. Want the user's role? Hope the `authenticate` middleware ran first and set `req.user`. Want type safety? Manually extend the `Request` interface and hope reality matches.
- **h3** has a cleaner `event` object, but no built-in system for extending it type-safely or computing properties lazily. You end up writing the same ad-hoc patterns.

Wooks treats **event context as the central design problem**:

- **Typed slots** — declare context properties with compile-time types, not string keys on a mutable object
- **Lazy computation** — nothing runs until accessed; `cached()` slots compute on first read and stay cached
- **Automatic caching** — call a wook ten times, it only does work once
- **Type-safe extensibility** — `defineWook()` lets you create composables that extend the context without touching any global object

The composable API — `useRequest()`, `useBody()`, `useAuthorization()` — is what naturally emerges from this. It's not syntactic sugar over `req` and `res`. It's what proper event context management actually looks like.

## The Origin Story

We were building backend services while using Vue's Composition API heavily on the frontend. The contrast was painful.

In Vue, you write `useAuth()` and get back credentials, state, and actions — typed, cached, self-contained. On the backend, you'd pass context objects through every function, parse data eagerly in middleware, and pray the types lined up.

The question was simple: **why can't Vue-style composables exist on the server?**

Turns out they can — thanks to `AsyncLocalStorage`. It gives you per-event context propagation, the same concept that makes `ref()` and `computed()` work in Vue's setup functions, but for async handlers. Once we had that, the pattern mapped naturally to any event type: HTTP requests, CLI commands, workflows, custom events. We called these server-side composables **wooks** — from **w**(eb) (h)**ooks**.

## The Design Decisions

### Lazy by default

Traditional frameworks parse and compute everything in middleware before your handler even runs. Reject the request early? Too bad — you already paid for all that work. Wooks does nothing until you ask. Data is parsed on demand, computed lazily, and cached for the event lifetime. It's not just faster — it makes the code honest about what it actually does.

### No middleware pipeline

Middleware forces you to think about ordering — get it wrong and the bugs are subtle. Wooks have no ordering. They read from context, they write to context, and they can be called from anywhere. There's no pipeline to break, no "did that middleware run yet?" guessing games.

### One pattern for everything

HTTP, CLI, and workflows share the same `EventContext`, the same `defineWook`, the same `key`/`cached` primitives. Write a logging wook once — it works in an HTTP handler, a CLI handler, and a workflow step, unchanged. The framework doesn't care what kind of event triggered the handler. It only cares about what's in the context.

### Types that actually work

`key<string>('userId')` gives you a `Key<string>`. `defineWook((ctx) => ({ ... }))` infers the return type. No indirection, no string casts, no manual interface extensions. Every primitive is generic — type safety comes for free.

## Fast Where It Matters

Wooks isn't just well-designed — it's fast. In a [production-realistic benchmark](/benchmarks/wooks-http) simulating a real SaaS API with auth, cookies, and body parsing, Wooks leads all tested frameworks — ahead of Fastify, h3, Hono, and Express.

The lazy architecture pays off most where it matters: cookie-heavy browser traffic (the most common SaaS pattern) and early rejection of bad requests. When auth fails, Wooks skips body parsing entirely — dramatically faster than frameworks that parse eagerly.

The underlying [`@prostojs/router`](https://github.com/prostojs/router) is the fastest router on deeply-nested parametric routes while offering the richest feature set — regex constraints, multiple wildcards, optional parameters — that trie-based alternatives can't match. See the [full benchmark analysis](/benchmarks/wooks-http) for details.

## When to Use Wooks

Wooks is a great fit if you want backend code that reads like Vue composables — function calls that return typed data, no ceremony. It shines when you're handling multiple event types (HTTP, CLI, workflows) with a consistent API, when you care about TypeScript ergonomics, or when you want explicit control over what work actually gets done per event.
