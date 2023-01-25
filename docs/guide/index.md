# Getting Started

::: warning
The work on Wooks is still in progress. It is already suitable for
out-of-the-box use for HTTP events, but some of the APIs can still change.
:::

This section describes the basic ideas and a concept of Wooks with no dive into implementation or specific event types.

## Overview

Wooks (Web-Hooks) is an event processing framework. What does processing mean?
Usually each event processing workflow consists of 3 steps:

1. **Routing** — lookup for a proper event handler;
2. **Context**ing — parsing, fetching, caching, authorizing...
3. **Responding** — acting, responding to the event.

Each of these steps is somehow covered by Wooks in a generic manner.

Of course the major functionality of Wooks is built around http events.
It basically started with http events.
Nevertheless you can build CLI with the similar approach.
And even more event types support is coming :tada:.

The main ideas behind Wooks are:
- Each event can be **routed** to a handler
- Each event has its **context** (state)
- Event **context** (state) is stored in a special object and available to the handlers through **composables** (hooks)
- A handler may return some data that has to be interpreted as a **Response**

::: tip
*Composables* concept is kindly borrowed from Vue 3 Composition API. Or it's also similar to react *hooks*.
:::

## Event Routing

Fast and robust routing is achieved with [@prostojs/router](https://github.com/prostojs/router).
It's basically an URI router that supports parameters and wildcards.

It's as fast as `find-my-way` used by `fastify` *(in some tests it is even faster)*, see benchmarks [here](https://github.com/prostojs/router-benchmark).
But it's less buggy (IMO) and handles `%`-encoding properly with no compromises.

See performance comparison table with `express`, `find-my-way` and `radix3` ([source](https://github.com/prostojs/router-benchmark)):

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

When an event handler is found by router, the handler and the route params/wildcards are passed to Wooks processing event loop. At that moment a new **event context** is created with pre-filled URI-params.

Each event context has:
- `type`: same as event source (`HTTP`, `CLI`, ...)
- `params`: parsed by router on lookup
- `custom data`: anything that needs to be parsed, fetched and cached (e.g. `parsedBody` of HTTP event)

The generic event context API is implemented in `@wooksjs/event-core` library.

Each event-specific library provides its wrapper of `event-core`. The reason for that is to provide proper types and event-specific composables.
Such libraries refixed with `event-`, e.g. `@wooksjs/event-http`, `@wooksjs/event-cli`, ...

The `event-core` functionality includes the following actions:
- create/clear/restore event context
- get/change/hook to a specific property of event context

Besides actions it supplies several composables:
- `useRouteParams` — provides params parsed by router
- `useEventId` — provides an unique event ID (uuid)


## Response

There is no generic response handling in Wooks. Each event-specific wrapper is responsible for managing the response from the handlers.
For instance `@wooksjs/event-http` comes with a **responder** that is capable of calling `res.writeHead(...)` and `res.end(...)` based on the event
context and returned values from event handler.

## Your First Wooks Project

You actually can not just use Wooks as a generic thing. It can not handle any of the events. It only provides
a landscape with router and event context. So you always need some event-specific library together with Wooks.

Currently there are two of such libraries:

1. `@wooksjs/event-http` — http event processing, it can easily replace `express` or `fastify`
1. `@wooksjs/event-cli` <Badge type="warning" text="WIP" /> — command line input processing, helps to route commands

In further sections of this documentation you'll find detailed examples of how to use this framework.