# Why Wooks

::: warning
Work on Wooks is still in progress. It is already suitable for immediate use in HTTP events,
but some APIs may still undergo changes.
:::

Developers often struggle when choosing a suitable framework for web applications. Some opt for Express,
while others turn to Fastify in hopes of achieving faster server performance ⚡.

Each of these frameworks has its own advantages and disadvantages. Express, for example, is built on the
concept of middlewares. It lacks a proper router, and all routes are checked in the order of their creation.
On the other hand, Fastify offers a proper router but attempts to minimize the use of middlewares.
However, both frameworks share similarities.

## The problems

One of the challenges in event processing (particularly with HTTP requests) is that an event can carry payload,
which may be required by handlers. Some parts of the payload are consumable as they are, while others need to
be parsed or validated against various data sources such as databases, identity and access management (IAM) systems,
attribute-based access control (ABAC), and so on.

When parsing is necessary, it is preferable to do it only once. However, many existing frameworks parse everything
that might be needed each time an event is triggered. The issue is that there are numerous scenarios where the
parsed body or cookies are never used.

Another problem is determining where to cache already parsed and fetched data. Middleware-based frameworks typically
attach everything to the request object, which leads to the following issues:

-   The request object becomes bloated with an excessive number of properties.
-   When using TypeScript, it is unclear how to properly type the request object
(Is it still `IncomingMessage`? Is it `Express.Request`? What are the differences?)
-   The request object frequently appears in middlewares and handlers and may inadvertently
be linked to persistent objects, resulting in memory leaks.

## What's the difference with Wooks?

Wooks addresses the problem of on-demand parsing and fetching of data using **composable functions** (hooks).
When you need to parse a body, you can simply call the appropriate composable function, which handles the
parsing for you. The same goes for cookies and other data.

Unlike other frameworks, Wooks does not modify the request object (or any other source event object). Instead,
it utilizes an **event context**. This event context is created for each event and has proper typing. All interactions
with the event context are **strictly** through the **event context API**. Composable functions utilize the event context
and cache parsed or fetched data there.

