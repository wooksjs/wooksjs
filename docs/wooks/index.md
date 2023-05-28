# Welcome to Wooks!

::: warning
Wooks is an evolving framework. It's fully functional and ready for immediate use, but please note that certain APIs may be fine-tuned as we proceed.
:::

You're about to discover the principles and concepts that make up the backbone
of Wooks, without getting into the nitty-gritty of specific implementations or
event types.

[[toc]]

## An Intro to Wooks

Welcome to Wooks! This innovative event processing framework handles all the key
steps of event processing workflows: **Routing**, **Context**ing, and
**Responding**.

Initially, Wooks was born to manage HTTP events, but now it also supports
building efficient command-line interfaces (CLIs). And the best part? We're
planning on introducing even more event types soon!

The essence of Wooks lies in its core principles:

- Every event can be **routed** to its ideal handler.
- Each event comes with its unique **context** (state).
- The event **context** (state) resides in a special object that is accessible
  to handlers through **composables** (hooks).
- Handlers can return data to be interpreted as a **Response**.

::: tip
The inspiration behind _composables_ comes from the Vue 3 Composition
API. It also bears similarities to React's _hooks_.
:::

## Event Routing

Wooks leverages the power of
[@prostojs/router](https://github.com/prostojs/router) for swift and reliable
routing. This versatile URI router supports parameters and wildcards and
competes with `find-my-way` in terms of speed. Check out the
[comparison benchmarks](https://github.com/prostojs/router-benchmark) with
`express`, `find-my-way`, and `radix3`.

Here is a snapshot of the performance:

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

Once the router locates an event handler, both the handler and route parameters
are handed over to the Wooks event processing loop. Here, a new event context is
born with pre-filled URI parameters.

An event context includes:

- `type`: Aligns with the event source (`HTTP`, `CLI`, etc.)
- `params`: Parameters parsed by the router during the lookup.
- `custom data`: Additional data to be parsed, fetched, and cached (like the
  `parsedBody` of an HTTP event)

The base API for the event context is in the `@wooksjs/event-core` library.

Event-specific libraries offer wrappers around event-core for accurate typing
and event-specific composables. These libraries all have the `event-` prefix,
such as `@wooksjs/event-http`, `@wooksjs/event-cli`, and so on.

## Response

While Wooks doesn't offer a generic response handling mechanism, each
event-specific wrapper library takes care of response management. For example,
`@wooksjs/event-http` includes a **responder** that can manage responses based
on the event context and handler's returned values.

## Ready to Explore More?

Currently, Wooks offers two libraries for creating event processing
applications:

1. `@wooksjs/event-http` — Perfect for handling HTTP event processing and a
   worthy alternative to well-known web application frameworks. Dive deeper
   [here](/webapp/).
2. `@wooksjs/event-cli` — Manages command-line input processing and command
   routing. Find out more [here](/cliapp/).

In the subsequent sections of this documentation, we'll show you detailed
examples of how to make the most of this dynamic framework. Stay tuned!
