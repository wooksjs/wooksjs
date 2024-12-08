# What is Wooks?

Wooks is a next-generation, TypeScript-first, event-driven framework designed to elegantly handle the entire lifecycle of various event types—from HTTP requests to CLI commands and beyond. At its core, Wooks tackles the common challenges of routing, context management, and data processing in a flexible, extensible, and performance-conscious manner.

## A Framework-Agnostic Event Engine  
In traditional Node.js frameworks like Express or Fastify, everything revolves around HTTP. Wooks, however, starts from a more fundamental perspective: it treats every incoming interaction as an *event*, and it can just as easily handle non-HTTP events as it does HTTP requests. While it provides dedicated wrappers for HTTP servers, it also supports other event sources such as CLI inputs or custom workflows.

## Composable Context Management
One of Wooks’ standout features is its approach to handling contextual data, such as request bodies, query parameters, user authentication data, or even low-level technical details. Instead of attaching these properties directly to the `req` object or relying on global variables, Wooks introduces the concept of **composables**.

## What Are Composables?
If you are familiar with frontend frameworks like Vue.js or React, you might have encountered the idea of "hooks" or "composables": functions that let you “plug in” features and behaviors without cluttering your code with global state or unwieldy dependencies. Wooks brings this pattern to the server-side world, offering a similar approach for dealing with contextual data in event handlers.

For example, to access the parsed request body in an HTTP event, you might write something like:

```ts
import { useBody } from '@wooksjs/event-http'

app.post('/submit', async () => {
  const { parseBody } = useBody()
  const body = await parseBody<{ name: string, email: string }>()
  // `body` is now properly typed and accessible here
  return { message: `Received data from ${body.name} <${body.email}>` }
})
```

Here’s what’s happening:

- **No Pollution of Native Objects:** Instead of stuffing `req.body` or `req.user` properties directly into the request object, composables access the data from a shared, context-aware storage. This keeps the request object clean and preserves native types.
  
- **Type Safety and IDE Support:** Because Wooks is built in TypeScript from the start, each composable can provide strong typing, enhancing IDE auto-completion and helping you catch errors at compile-time rather than at runtime.
  
- **Async-Aware Context:** Wooks leverages Node’s `AsyncLocalStorage` under the hood. This means that even if your handler is asynchronous and involves multiple `await` calls, the context—along with all composables—remains stable and accessible. Unlike other frameworks that may require you to pass context objects around manually, Wooks handles this continuity for you, simplifying your code and ensuring reliability.

## A Clean, Layered Architecture
Wooks is designed as a collection of libraries that each solve a discrete piece of the puzzle:

- **[@prostojs/router](https://github.com/prostojs/router):** A fast and well-structured router, decoupled from any specific framework, ensures your routing logic is both clean and high-performance.
- **@wooksjs/event-core:** Manages the event context and the composable system, providing a generic mechanism to handle any kind of event.
- **@wooksjs/event-http:** Builds on `event-core` to provide a familiar HTTP server interface with built-in context and composables.

By separating concerns, Wooks empowers you to build just what you need—focusing on domain logic rather than wrestling with request objects, middleware stacks, or hidden state. Its composable pattern encourages code reuse, simpler tests, and cleaner abstractions than you might find in traditional frameworks.

In short, Wooks takes the best ideas from modern web frameworks, rethinking them in a more generic and extensible form, and adding powerful, easily testable abstractions. It invites you to write modular, maintainable, and well-typed server-side code, whether you’re building a standard REST API, a CLI tool, or a custom event-driven architecture.
