# Why Wooks?

## The Origin

We were building backend services while working heavily with Vue's Composition API on the frontend. The contrast was stark.

In Vue, you write `useAuth()` and get back credentials, state, and actions — typed, cached, self-contained. On the backend, you'd dig through `req.headers.authorization`, manually decode Base64, pass the result through middleware, and hope the types lined up.

The question was simple: **why can't `useAuthorization()` exist on the server?**

The answer turned out to be `AsyncLocalStorage`. It gives you per-request context propagation — the same thing that makes `ref()` and `computed()` work in Vue's setup functions, but for async server handlers. Once we had that, the composable pattern mapped directly: `useBody()`, `useResponse()`, `useCookies()`, `useRouteParams()`.

## The Design Decisions

### Lazy by default

Express parses the body in middleware before your handler runs. If you reject the request on a missing header, you've already paid for body parsing. Wooks does nothing until you call a composable. `useBody().parseBody()` reads the stream on demand. `useResponse().setCookie()` only runs when you need cookies. This isn't just an optimization — it makes the code honest about what it actually does.

### No middleware pipeline

Middleware forces you to think about ordering. Auth before validation before body parsing before logging — and if you get the order wrong, bugs are subtle. Composables have no ordering. They read from context, they write to context, and they can be called from anywhere in the handler or any function it calls. There is no pipeline to break.

### One pattern for everything

HTTP, CLI, and workflows share the same `EventContext`, the same `defineWook`, the same `key`/`cached` primitives. An auth composable written for HTTP works in a CLI handler if the auth data is seeded into context. A logging composable works everywhere. The framework doesn't care what kind of event triggered the handler — it only cares about what's in the context.

### Types that work

Express `req` is typed as `Request`, and you cast your way from there. Fastify schemas produce types, but the machinery is complex. In Wooks, `key<string>('userId')` is a `Key<string>`. `defineWook((ctx) => ({ ... }))` infers the return type. `useBody().parseBody<MyType>()` gives you `MyType`. There's no indirection layer between what you write and what TypeScript sees.

## When to use Wooks

Wooks fits when you want server-side code that reads like frontend composables — function calls that return typed data, no ceremony. It's a good choice when you need more than HTTP (CLI, workflows), when you care about TypeScript ergonomics, or when you want explicit control over what runs per request.

It may not be the right fit if you're building on an ecosystem that expects Express middleware (like Passport.js) or if you need Nuxt/Nitro integration (use h3 for that).
