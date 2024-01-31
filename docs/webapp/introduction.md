# Introduction

## Overview

As an event processing framework, Wooks provides functionality for processing HTTP events.

::: tip
You can read an overview of how Wooks approaches the event processing in general [here](../#overview)
:::

Wooks HTTP allows you to create an HTTP server with the beauty of composable functions and fast [routing](../#event-routing).
It ships with many HTTP-specific composables built-in, such as:

- URL query params parser
- Cookie parser
- Body parser (many formats work out-of-the-box: `json`, `url-encoded`, `form`, ...)
- Static files
- Response Status
- Response Cookies
- Response Headers
- Cache Control
- ...

None of these composables is triggered unless you want it. This makes Wooks HTTP extremely flexible and performant.

::: tip
A composable function (hook) is a function that hooks you to the [event context](../#event-context), e.g., URL params, body, cookies, etc.
:::

## Differences from other Web App Frameworks:

1. Wooks never mutates the request object (`req`). It stores a request context in a separate object(s) instead ([event context](../#event-context)).
2. Wooks never parses anything (cookies, body) before it is really requested by the request handler.
3. There is no complex predefined data object containing everything (cookies, headers, body, parsed body, etc.). Composables (hooks) provide the data from the event context on demand.
4. No need for tons of dependencies (middlewares such as `cookie-parser`, etc.). Wooks implements those in a simple performant way.
