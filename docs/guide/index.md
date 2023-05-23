# Getting Started

::: warning
Work on Wooks is still in progress. It is already suitable for immediate use in HTTP events,
but some APIs may still undergo changes.
:::

This section provides an overview of the basic ideas and concepts behind Wooks,
without diving into specific implementations or event types.

## Overview

Wooks (Web-Hooks) is an event processing framework that encompasses
the three main steps involved in event processing workflows:

1. **Routing** — Finding the appropriate event handler.
2. **Context**ing — Parsing, fetching, caching, authorizing, and other contextual operations.
3. **Responding** — Acting upon the event and generating a response.

Wooks addresses each of these steps in a generic manner.

The primary functionality of Wooks revolves around HTTP events, because it initially started with HTTP events.
However, you can also build command-line interfaces (CLIs) using a similar approach.
Additionally, support for other event types is planned for the future.

The key ideas behind Wooks are:

-   Each event can be **routed** to an appropriate handler.
-   Each event has its own **context** (state).
-   The event **context** (state) is stored in a special object and is accessible to handlers through **composables** (hooks).
-   Handlers may return data that should be interpreted as a **Response**.

::: tip
The concept of _composables_ is inspired by Vue 3 Composition API and in some ways is similar to React _hooks_.
:::

## Event Routing

Wooks achieves fast and reliable routing using [@prostojs/router](https://github.com/prostojs/router).
This URI router supports parameters and wildcards.

In terms of speed, it is comparable to `find-my-way`, which is used by `fastify` _(and in some tests, it is even faster)_.
You can find benchmarks comparing it to `express`, `find-my-way`, and `radix3` [here](https://github.com/prostojs/router-benchmark).

Here is a performance comparison table:

::: details
|Test Name|Express avg op/ms|FindMyWay avg op/ms|ProstoRouter avg op/ms|Radix3 avg op/ms|
|:-|-:|-:|-:|-:|
|Short static|1 792|7 070|6 912|10 326|
|Static with same radix|1 388|4 662|8 537|14 058|
|Dynamic route|739|1 768|1 888|959|
|Mixed static dynamic|685|3 101|3 470|988|
|Long static|637|2 174|8 934|14 000|
|Wildcard|486|2 081|2 065|1 019|
|**All together**|**663**|**2 328**|**2 893**|**1 549**|
:::

## Event Context

When a router finds an event handler, both the handler and the route parameters/wildcards are passed to
the Wooks event processing loop. At this point, a new event context is created with pre-filled URI parameters.

Each event context includes:

-   `type`: Same as the event source (`HTTP`, `CLI`, etc.)
-   `params`: Parameters parsed by the router during lookup.
-   `custom data`: Any additional data that needs to be parsed, fetched, and cached (e.g. the `parsedBody` of an HTTP event)

The generic event context API is implemented in the `@wooksjs/event-core` library.

Each event-specific library provides its own wrapper around event-core to provide proper typings
and event-specific composables. These libraries have the `event-` prefix, such as `@wooksjs/event-http`,
`@wooksjs/event-cli`, and so on.

The `event-core` functionality includes the following actions:

-   Creating, clearing, and restoring event contexts.
-   Getting, changing, and hooking into specific properties of the event context.

It also provides several composables:

-   `useRouteParams`: Provides access to the parameters parsed by the router.
-   `useEventId`: Provides a unique event ID (UUID).
-   `useEventLogger`: Provides an event logger instance from ([@prostojs/logger](https://github.com/prostojs/logger)).

## Response

Wooks does not provide a generic response handling mechanism. Each event-specific wrapper library
is responsible for managing the responses from the handlers. For example, `@wooksjs/event-http` comes
with a **responder** that can call `res.writeHead(...)` and `res.end(...)` based on the event context and
the values returned by the event handler.

## Your First Wooks Project

You cannot use Wooks as a generic framework for handling any type of event. Instead,
you need to use an event-specific library in conjunction with Wooks.

Currently, there are two such libraries available:

1. `@wooksjs/event-http` — Handles HTTP event processing and can easily replace other well-known web application frameworks. See more details [here](./http/).
1. `@wooksjs/event-cli` — Handles command-line input processing and facilitates command routing. See more details [here](./cli/).

In the following sections of this documentation, you will find detailed examples of how to use this framework.
