# Comparison with other frameworks

When choosing a server-side framework, developers often reach for familiar solutions like **Express** or **Fastify**, or consider modern alternatives like **h3**. While each of these frameworks gets the job done, they make certain trade-offs that Wooks aims to address by rethinking event handling, routing, and context management.

## 1. Control Over the Request Lifecycle

**Express & Fastify:**  
In these frameworks, the request lifecycle is often heavily influenced by middleware. For example, body parsing is frequently done by a middleware layer before your handler runs. By the time your route handler is called, request bodies may already be parsed and attached to `req`, even if your logic doesn’t need them. If you discover that your route parameters are invalid and want to return an error immediately, the overhead of reading and parsing the body has already occurred, costing both performance and clarity.

**Wooks:**  
Wooks calls your event handler as soon as the event (e.g., an HTTP request) is generated—usually right after receiving headers. You decide if and when to parse the body by calling a composable like `useBody()` yourself. This allows you to:

- **Validate Early:** Check route parameters, headers, or other conditions before touching the body. If invalid, respond with an error immediately—no wasted cycles on unnecessary body parsing.
- **Conditional Parsing:** Only parse the body if it’s actually needed, improving performance and reducing overhead.
- **Better Resource Management:** Achieve more explicit and efficient control over the request lifecycle, making your code both faster and more transparent.

## 2. Smarter and More Flexible Routing

**Express:**  
Express routing is straightforward but not optimized. It checks each registered route in sequence until it finds a match, which can become a bottleneck for large sets of routes. It doesn’t provide built-in complexity like parameter regexes or multiple wildcards out of the box, and often relies on external libraries or manual code to achieve advanced patterns.

**Fastify:**  
Fastify improves routing performance and provides some optimizations. However, its routing and encoding/decoding mechanisms can sometimes behave in unexpected ways, especially when dealing with complex parameter patterns. Debugging such cases can become tricky.

**h3:**  
h3’s routing is simple and effective for many use cases, but it focuses mainly on the Nuxt and Nitro ecosystem. Its routing system doesn’t emphasize complex optimizations or features like multiple wildcards and regex parameter constraints.

**Wooks (via [@prostojs/router](https://github.com/prostojs/router)):**  
Wooks uses `@prostojs/router`, a carefully designed, standalone routing library that offers:

- **Hierarchical Routing Structure:** It categorizes routes into statics, parameters, and wildcards, then applies indexing and caching to quickly find matches.
- **Multiple Wildcards and Regex Parameters:** You can define routes like `/static/*/test/*` or apply regex constraints directly to parameters and wildcards, such as `/api/time/:hours(\\d{2})h:minutes(\\d{2})m` or `/static/*(\\d+)`. Even multiple wildcards in the same path are supported.
- **On-the-Fly Parsers:** It generates parsing functions during registration, enabling parameter parsing to be done in a single efficient call.
- **Predictable Encoding/Decoding:** It handles URI encoding/decoding in a clean, transparent manner, avoiding the quirks and bugs you might encounter elsewhere.

This means you get **fast, predictable, and highly flexible routing** that easily handles complex URL patterns—something that can be awkward or inefficient in Express, Fastify, or h3.

Below is performance comparison for different routers ([benchmark source code](https://github.com/prostojs/router-benchmark)):

|Test Name|Express avg op/ms|FindMyWay avg op/ms|ProstoRouter avg op/ms|Radix3 avg op/ms|
|:-|-:|-:|-:|-:|
|Short static|1 792|7 070|6 912|10 326|
|Static with same radix|1 388|4 662|8 537|14 058|
|Dynamic route|739|1 768|1 888|959|
|Mixed static dynamic|685|3 101|3 470|988|
|Long static|637|2 174|8 934|14 000|
|Wildcard|486|2 081|2 065|1 019|
|**All together**|**663**|**2 328**|**2 893**|**1 549**|


## 3. Context Management Without Passing Around Objects

**Express & Fastify:**  
These frameworks typically attach custom data (like the parsed body, user info, or other state) directly to `req`. This approach:

- Pollutes the request object.
- Makes type definitions harder to maintain.
- Forces you to pass `req` and `res` everywhere, tightening the coupling with HTTP specifics.

**h3:**  
h3 improves this pattern by giving you an `event` object that holds request and response context. While this is cleaner than polluting `req`, you still need to pass the `event` object into every composable or utility function. This adds a minor overhead and some boilerplate to every call.

**Wooks:**  
Wooks leverages `AsyncLocalStorage` to provide implicit context. Composables like `useBody()` or `useRouteParams()` automatically access the current event context without you having to pass it around. This approach:

- **No Extra Arguments:** No need to carry an `event` or `req` object into every function.
- **Clean & Implicit:** Context is just there, making your code more readable and maintainable.
- **Fully Typed:** The entire system is built in TypeScript, so the context is strongly typed by default.

## 4. Not Just HTTP

**Express & Fastify:**  
These frameworks are primarily HTTP-oriented. Extending them to other event types (like CLI events or custom workflows) often requires separate tools or custom patterns.

**h3:**  
h3 is closely tied to HTTP and the Nuxt ecosystem. While powerful for its intended use case, it’s not designed from the start to be a multi-event framework.

**Wooks:**  
Wooks is event-driven at its core. HTTP is just one implementation. The same composable, context-driven approach applies equally well to CLI commands, workflow triggers, or other custom event sources. This makes Wooks incredibly flexible and future-proof.

---

**In Summary:**  
- **Early and Explicit Parsing Control:** Only parse the request body if needed, saving resources and time.
- **Advanced and Efficient Routing:** Benefit from sophisticated patterns, multiple wildcards, regex parameters, and on-the-fly parsers.
- **Implicit Context Access:** No passing around `event` objects or cluttering `req`.
- **Multi-Event Capability:** Easily handle not just HTTP, but any type of event, all with the same composable architecture.
