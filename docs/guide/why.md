# Why Wooks

::: warning
The work on Wooks is still in progress. It is already suitable for
out-of-the-box use for HTTP events, but some of the APIs can still change.
:::

Developers are struggling to pick a proper framework for web application.
Some of them just use express. The others take fastify hoping that it'll bring more speed to the server ⚡.

Those frameworks of course have pros and cons. For instance express is built on a concept of middlewares.
It doesn't have proper router, all the routes are checked in order of creation.
Fastify has a proper router but tries to get rid of middlewares. Although they still have many things in common.

## The problems

One of the problems with event processing (http request particularly is obviously an event) is that event can carry
some payload that might be required by handlers. Well, some part of the payload is consumable the way it was shipped from
the event trigger. The other part of the it must be parsed or checked against various data sources (db, iam, abac, ...).

If we have to parse something, we want to make sure we do it once. So why don't just parse everything that we might need
every time event is triggered? Well, most of express and fastify apps do exactly this. The problem is that there are many scenarios
where parsed body was never used, as well as parsed cookies.

Another problem is where to cache already parsed and fetched data? Express and fastify simply attach everything to a
request instance. This leads to the following issues:
- Request object grows and collects too many props;
- When using TS it's not clear how exactly type the request (Is it still `IncomingMessage`? Is `Express.Request`? What's the difference?);
- Request object always appears in middlewares and handlers and may be accidentally linked to some persistent object -> memory leaks.

## What's the difference with Wooks

Wooks with the help of **composable functions** (hooks) solves the problem of parsing/fetching data on demand. When you need a parsed body
you call composable function that will parse it for you. Same for cookies. Same for everything.

Wooks does not modify request object (or whatever source event object), it uses an **event context** instead. That event context
is created for each event, it has proper typing. All the interactions with the event context are **only** possible
through the **event context API**. Composable functions use event context and cache parsed/fetched data there.