# Introduction to Wooks HTTP

Wooks is an event-driven framework that can handle all kinds of events — from HTTP requests to CLI commands and custom workflows. When it comes to HTTP events, the `@wooksjs/event-http` adapter provides a streamlined, composable, and performant way to build servers and APIs.

## Key Concepts

- **Event-Driven:** Wooks treats HTTP requests as just one type of event, meaning the same foundational patterns apply whether you’re building a REST API, handling CLI inputs, or orchestrating workflows.
  
- **Composables (Hooks):** Inspired by the idea of hooks in frontend frameworks, Wooks’ composables let you tap into the event context at any point. For HTTP events, composables give you easy, on-demand access to data like query parameters, request bodies, cookies, and more—without cluttering your request objects or forcing you into rigid middleware chains. *Learn more about [Composables](/wooks/what#what-are-composables).*
  
- **Opt-In Features:** Nothing happens unless you ask for it. Need to parse JSON bodies? Call `useBody()` when you need it. Want query params? Use `useQueryParams()`. This ensures minimal overhead and maximum control.

::: info
Get to know more about key wooks concepts reading [What is Wooks?](/wooks/what) article.
:::


## What Does Wooks HTTP Offer?

- **Fast Routing:** Built on [`@prostojs/router`](https://github.com/prostojs/router), it provides a highly performant routing mechanism with support for static routes, parameters, wildcards, and regex constraints.
- **Rich HTTP-Specific Composables:**  
  - **URL Query Params Parser:** Retrieve and manipulate query parameters effortlessly.
  - **Cookie Parser and Setter:** Access and modify cookies with composables that handle encoding, decoding, and options.
  - **Body Parser:** Work with multiple body formats (JSON, URL-encoded, multipart forms) on demand.
  - **Static File Serving:** Efficiently serve static assets.
  - **Response Controls:** Set status codes, headers, cookies, and cache directives easily—again, only if you actually need them.

**Flexibility and Performance:**

Because Wooks uses composables on-demand, you’re never forced to pay the performance cost for features you don’t need. This design keeps your application lean and responsive, even as you add complexity.

## How Does Wooks Compare to Alternatives?

Wooks HTTP sits in the same space as Express, Fastify, and h3, providing direct access to Node.js’ built-in HTTP server and leveraging its own high-performance router. For an in-depth look at how Wooks stacks up against these popular frameworks, see the [Comparison section](/wooks/comparison).

Despite offering its own native approach, Wooks doesn’t force you to abandon your existing setup. It supports adapters for Express, Fastify, and h3, enabling you to integrate Wooks’ composables and event-driven paradigms right into your current server architecture.


## Next Steps

- Read [Why Wooks?](/wooks/why) to understand why Wooks is a great choice for your next project.
- Dive deeper into event-driven architecture and the `store` API in the [Advanced Wooks Context Guide](/wooks/advanced/wooks-context).
- Check out the [Quick Start](/webapp/) page to see how to quickly spin up a Wooks HTTP server.

By approaching HTTP as just another event type, Wooks HTTP combines the familiar with the flexible, helping you build fast, clean, and maintainable web servers.
