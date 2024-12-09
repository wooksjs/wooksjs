# Why Wooks?

Building server-side applications with frameworks like Express or Fastify often leads to a familiar set of challenges covered below.

## 1. A Tangle of Contextual Data
In traditional frameworks, request data (such as parsed bodies, authenticated users, and custom properties) often ends up attached directly to the `req` object. While this may feel convenient at first, it quickly becomes unwieldy:

- **Hard-to-Manage Types:** Adding arbitrary properties to `req` muddles the type definitions, making it harder for TypeScript to guide you as your application grows.
- **Namespace Collisions & Clutter:** As your codebase expands, `req` becomes a dumping ground, and distinguishing between built-in properties and custom fields can be confusing.
- **Difficult to Reuse & Test:** Logic that deals with `req` and `res` directly is harder to isolate and test independently.

### How Wooks Solves This 
Wooks introduces **composables**, which provide a systematic way to access and manage contextual data without ever cluttering the request object. Instead of polluting `req`, you simply call functions like `useBody()` or `useParams()` that neatly pull their data from a context store managed by Wooks. This approach:

- Ensures strong TypeScript support, so you know exactly what data you’re working with.
- Keeps your application’s entry points tidy and maintainable.
- Makes testing easier since you can exercise logic in a more controlled, context-driven manner.

## 2. Complexity in Middleware & Plugins  
Express and Fastify rely heavily on middleware chains and plugins to manage functionality like request parsing, logging, validation, and authentication. While these patterns are powerful, they can also become complicated in large projects:

- **Debugging Complexity:** When an issue arises, it can be tricky to identify which middleware broke the chain or modified the request incorrectly.
- **Rigid Ordering & Coupling:** Middleware ordering matters. Accidentally placing a piece of middleware out of sequence can cause subtle bugs.
- **Limited Reusability:** The middleware approach can make it difficult to share logic or apply it selectively across different event types.

### How Wooks Solves This 
By focusing on composable, context-based logic instead of a chain of middlewares, Wooks encourages you to write modular functions that can be reused anywhere. Since composables access the same contextual store, their execution doesn’t depend on a linear processing pipeline. This architectural clarity saves time, reduces guesswork, and keeps your code modular and discoverable.

## 3. Event-Driven, Not Just HTTP-Driven
Both Express and Fastify were born primarily as HTTP frameworks. Extending them to work with other event types — like CLI commands or custom workflow triggers — can be cumbersome or require separate tooling and architectural decisions.

### How Wooks Solves This
Wooks decouples the concept of “events” from the transport layer. HTTP requests, CLI commands, or any other form of event can be handled uniformly. This holistic approach:

- Promotes code reuse across different parts of your application’s ecosystem.
- Enables consistent logging, error handling, and context management, no matter the event type.
- Future-proofs your architecture by allowing you to easily integrate new types of events as your application evolves.

## 4. Strong TypeScript Integration & Developer Ergonomics 
While both Express and Fastify have TypeScript definitions, they can still feel like a thin layer slapped onto an existing pattern. You might find yourself fighting against the type system rather than embracing it:

- **Inconsistent Type Safety:** Adding custom properties or integrating complex middleware often leads to type gaps.
- **Difficult Refactoring:** As the application grows, refactoring can be risky if the types don’t accurately represent the shape of your code.

### How Wooks Solves This  
Wooks is built in TypeScript from the beginning, making typing a first-class concern rather than an afterthought. The composable pattern ensures that data requested through functions like `useBody()` is always strongly typed. This results in:

- More confident refactoring, as the type system will warn you of any contract violations.
- Better integration with IDEs and code editors, giving you the benefits of smart autocomplete and inline documentation.
- Reduced runtime bugs, since many errors are caught during development.

## Summary
Wooks is not just a different syntax for the same patterns. It rethinks how we approach server-side development, taking lessons from frontend frameworks and applying them to the backend to achieve cleaner, more testable, and more maintainable solutions. If you’ve ever struggled with messy request objects, brittle middleware chains, poor type safety, or difficulty repurposing your code for different event sources, Wooks provides a fresh, powerful answer.
