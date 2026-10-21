# Response Composables

Wooks HTTP implements a response renderer that interprets handler return values and automatically manages `Content-Type` and `Content-Length` headers.
You can control all aspects of the response through the `useResponse()` composable, which returns an `HttpResponse` instance with chainable methods.

## Content

[[toc]]

## Plain Response

The simplest way to respond is to return a value from the handler function.
Whatever is returned becomes the response body. Objects are JSON-stringified with appropriate headers set automatically.

Example:

```js
app.get('string_response', () => {
    return 'hello world!';
    // responds with:
    // 200
    // Content-Length: 12
    // Content-Type: text/plain
    // hello world!
});

app.get('json_response', () => {
    return { value: 'hello world!' };
    // responds with:
    // 200
    // Content-Length: 24
    // Content-Type: application/json
    // {"value":"hello world!"}
});
```

**Supported response types:**

1. `string` (text/plain)
2. `object/array` (application/json)
3. `boolean` / `number` (text/plain)
4. `Uint8Array` / `Buffer` (sent as-is; set `Content-Type` yourself — none is set by default)
5. `Readable` stream (you must specify `Content-Type` yourself). It is piped with backpressure: destroyed if the client disconnects, and a stream error mid-body aborts the connection so a truncated body never looks complete.
6. `fetch` `Response` (status, headers, and body forwarded — see below)

Instead of returning a value, you can also set the body explicitly on the response instance — `useResponse().setBody(data)` (chainable) or the `body` property.

### Returning a fetch `Response`

When a handler returns a `fetch` `Response`, its status, headers, and body are forwarded to the client:

- The `Response` status is used unless a status was already set via `useResponse()`.
- All headers from the `Response` are forwarded. Headers already set via `useResponse()` take precedence.
- Multiple `Set-Cookie` headers are preserved; cookies set via `setCookie()` are sent first.
- The body is streamed with backpressure; if the client disconnects, the upstream body is cancelled.

```js
app.get('sitemap.xml', () => {
    return new Response(xml, {
        headers: {
            'content-type': 'application/xml',
            'cache-control': 'public, max-age=3600',
        },
    });
});
```

The same rules apply on both delivery paths — real socket responses and programmatic [`app.fetch()`](../fetch.md) calls.

## Raw Response

If you need to take full control of the response, you can get the raw `ServerResponse` via `useResponse()`.
When you do this without passthrough, the framework will not process the handler's return value.

Example:

```js
import { useResponse } from '@wooksjs/event-http';

app.get('test', () => {
    const response = useResponse();
    const res = response.getRawRes();
    res.writeHead(200, {});
    res.end('ok');
});
```

If you want the raw `ServerResponse` but still want the framework to manage the response lifecycle,
pass `true` for passthrough:

```js
import { useResponse } from '@wooksjs/event-http';

app.get('test', () => {
    const response = useResponse();
    const res = response.getRawRes(true); // passthrough: framework still manages response // [!code hl]
    // Use res for reading or side effects, but still return a value:
    return 'ok';
});
```

## Headers

::: tip
This documentation presumes that you are aware of what Response Headers are used for.
If it's not the case please see [RFC7231](https://www.rfc-editor.org/rfc/rfc7231#section-7)
:::

The `useResponse()` composable provides header management methods directly on the `HttpResponse` instance. All setters are chainable.

Header names are case-insensitive: they are stored by lower-case name, so `setHeader('ETag', …)` replaces an `etag` set earlier, `getHeader('Content-Type')` finds `content-type`, `headers()` returns lower-case keys, and every header goes out exactly once (`Set-Cookie` aside). `Content-Length` always matches the bytes sent: it is computed for regular bodies, taken from a returned fetch `Response` for its body (a length you set yourself is dropped there), and kept as you set it for streams. A response with an empty body (204) carries no `Content-Length` and no inferred `Content-Type`.

Example:

```js
import { useResponse } from '@wooksjs/event-http';

app.get('test', () => {
    const response = useResponse();

    response
        .setContentType('application/json')
        .setHeader('server', 'My Awesome Server v1.0')
        .enableCors();

    return '{ "value": "OK" }';
});
```

**Available methods:**

| Method | Description |
|--------|-------------|
| `setHeader(name, value)` | Sets a response header |
| `setHeaders(headers)` | Batch-sets multiple headers from a record |
| `getHeader(name)` | Gets a response header value |
| `removeHeader(name)` | Removes a response header |
| `headers()` | Returns all response headers |
| `setContentType(value)` | Sets the `Content-Type` header |
| `enableCors(origin?)` | Sets `Access-Control-Allow-Origin` (defaults to `*`) |

## Default Headers & Security Headers

You can pre-populate response headers for every request via the `defaultHeaders` option on `createHttpApp`. The `securityHeaders()` utility provides a curated set of recommended HTTP security headers. The option is read once, when the app is created: changing the object afterwards has no effect.

### App-level defaults

```js
import { createHttpApp, securityHeaders } from '@wooksjs/event-http';

// Apply recommended security headers to all responses
const app = createHttpApp({ defaultHeaders: securityHeaders() });

// Customize individual headers
const app = createHttpApp({
    defaultHeaders: securityHeaders({
        contentSecurityPolicy: false,                         // disable CSP
        referrerPolicy: 'strict-origin-when-cross-origin',   // override default
    }),
});

// Or use plain headers (no preset)
const app = createHttpApp({ defaultHeaders: { 'x-custom': 'value' } });
```

### Per-endpoint override

Handlers can override or remove default headers using `setHeader()`, `setHeaders()`, or `removeHeader()`:

```js
app.get('/api/data', () => {
    const response = useResponse();
    response.setHeaders(securityHeaders({
        contentSecurityPolicy: "default-src 'self' cdn.example.com",
    }));
    return { data: 'hello' };
});
```

### `securityHeaders(opts?)` defaults

| Header | Default Value | Option Key |
|--------|--------------|------------|
| `Content-Security-Policy` | `default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'` | `contentSecurityPolicy` |
| `Cross-Origin-Opener-Policy` | `same-origin` | `crossOriginOpenerPolicy` |
| `Cross-Origin-Resource-Policy` | `same-origin` | `crossOriginResourcePolicy` |
| `Referrer-Policy` | `no-referrer` | `referrerPolicy` |
| `X-Content-Type-Options` | `nosniff` | `xContentTypeOptions` |
| `X-Frame-Options` | `SAMEORIGIN` | `xFrameOptions` |

**Opt-in only** (not included by default):

| Header | Option Key |
|--------|------------|
| `Strict-Transport-Security` | `strictTransportSecurity` |

::: warning
HSTS (`Strict-Transport-Security`) is not included by default because it can lock users out if the site is not fully on HTTPS. Enable it explicitly: `securityHeaders({ strictTransportSecurity: 'max-age=31536000; includeSubDomains' })`.
:::

Each option accepts a `string` (override value) or `false` (disable that header).

## Cookies

::: tip
This documentation presumes that you are aware of what Cookies are and what the
additional cookie attributes are used for. If it's not the case please see [RFC6265](https://www.rfc-editor.org/rfc/rfc6265#section-4.1)
:::

Set outgoing cookies via the `HttpResponse` instance:

```js
import { useResponse } from '@wooksjs/event-http';

app.get('test', () => {
    const response = useResponse();

    response.setCookie('session', 'value', {
        expires: '2029-01-01', // Date | string | timestamp (ms)
        maxAge: '1h',          // seconds (number) or a duration string
        domain: 'my-domain',   // string
        path: '/home',         // string
        secure: true,          // boolean
        httpOnly: true,        // boolean
        sameSite: 'Lax',       // boolean | 'Lax' | 'None' | 'Strict'
    });

    return 'ok';
});
```

**Available methods:**

| Method | Description |
|--------|-------------|
| `setCookie(name, value, attrs?)` | Sets a cookie with optional attributes |
| `getCookie(name)` | Gets a previously set cookie's data |
| `removeCookie(name)` | Removes a cookie from the set list |
| `clearCookies()` | Removes all cookies from the set list |
| `setCookieRaw(rawValue)` | Sets a raw `Set-Cookie` header value |

::: info Duration units
Every duration that ends up in a header as seconds — cookie `maxAge`, `setCacheControl({ maxAge, sMaxage })`, `setAge()` — follows one rule: **a number is seconds** (`86400` = one day), **a string carries its units** (`'1d'`, `'1h 30m'`, `'1.5h'`; units `ms s m h d w M Y`). The header gets whole seconds as plain digits, rounded down and clamped to `0`–`2147483648` (RFC 9111): never a negative value or an exponent. A cookie `maxAge` of `0` or less renders `Max-Age=0`, which expires the cookie. A string that is not a duration (`'15x'`, or bare digits like `'3600'`, which need a unit) throws a `TypeError` instead of silently rendering `0`. Timestamps (`expires`, `setExpires()`) are milliseconds, like `Date.now()`.
:::

## Status

Control the response status code via `useResponse()`:

```js
import { useResponse } from '@wooksjs/event-http';

app.get('test', () => {
    const response = useResponse();

    response.setStatus(201);
    // or use the property directly:
    // response.status = 201;

    console.log(response.status); // 201

    return 'response with status 201';
});
```

If you don't set a status, Wooks auto-assigns one based on the HTTP method and response body:

| Condition | Status |
|-----------|--------|
| `POST` with body | 201 Created |
| Any other method with body (`GET`, `PUT`, `PATCH`, `DELETE`, …) | 200 OK |
| No body (any method) | 204 No Content |

The rule is exported, so tools that document responses (e.g. an OpenAPI generator) can reuse it instead of keeping a copy:

```ts
import { DEFAULT_HTTP_STATUS, getDefaultHttpStatus } from '@wooksjs/event-http'

DEFAULT_HTTP_STATUS             // { GET: 200, POST: 201, PUT: 200, PATCH: 200, DELETE: 200 }
getDefaultHttpStatus('PUT', true)   // 200
getDefaultHttpStatus('POST', false) // 204
```

Return `202 Accepted` explicitly (`setStatus(202)`) when a handler only queues the work.

### Status code constants

Two named helpers are exported from `@wooksjs/event-http` so you can avoid magic numbers:

-   `EHttpStatusCode` — a numeric enum of status codes (`EHttpStatusCode.Created === 201`, `EHttpStatusCode.NotFound === 404`, …).
-   `httpStatusCodes` — a record mapping each numeric code to its human-readable description (`httpStatusCodes[201] === 'Created'`).

```js
import { useResponse, EHttpStatusCode, httpStatusCodes } from '@wooksjs/event-http';

app.post('/items', () => {
    useResponse().setStatus(EHttpStatusCode.Created); // 201
    return { created: true };
});

httpStatusCodes[404]; // 'Not Found'
```

Both are plain values — use them anywhere a status code is needed (e.g. `useResponse().setStatus(...)` or `new HttpError(...)`). The same `EHttpStatusCode` enum drives the auto-status table above.

## Error Responses

Throw an `HttpError` from a handler to produce an error response:

```js
import { HttpError } from '@wooksjs/event-http';

app.get('admin', () => {
    throw new HttpError(403, 'Access denied');
});
```

The constructor takes a status code (default `500`) and a message string or a body object with a `message`. The rendered body always has the shape `{ statusCode, message, error }` (`error` is the status text); extra fields of a body object are merged in, and their types are inferred:

```js
throw new HttpError(400, { message: 'Validation failed', fields: ['name'] });
// { statusCode: 400, message: 'Validation failed', error: 'Bad Request', fields: ['name'] }
```

`statusCode`, `message` and `error` always come from the error itself, whatever the body object holds.

### Error codes and params

Give clients (and translators) something stable to key on: an UPPER_SNAKE `code` plus the `params` the message was built from. Both are optional and pass through to the rendered body:

```js
throw new HttpError(422, {
    message: 'Must be at least 3 characters',
    code: 'MIN_LENGTH',
    params: { min: 3 },
});
// { statusCode: 422, error: 'Unprocessable Entity', message: '…', code: 'MIN_LENGTH', params: { min: 3 } }
```

Keep `message` in your default language: it stays the fallback for clients that ignore `code`.

### Transforming every error body

`createHttpApp({ transformErrorBody })` sees every error body before it is rendered — thrown and returned `HttpError`s, other errors (as `500`) and the router's own `404` — and returns the body to send. It is the one place to translate messages from `code` + `params` (see [Locale](../locale.md)) or to strip fields:

```ts
const app = createHttpApp({
    transformErrorBody: (body, error, ctx) =>
        body.code ? { ...body, message: t(useLocale().get(), body.code, body.params) } : body,
});
```

Every response that goes through the error path — thrown or returned errors, the router's `404`, the automatic `412` — is made uncacheable: `Cache-Control` and `Expires` set before the failure are dropped and `Cache-Control: no-store` is sent, so a cache never stores a failure (RFC 9111). To send a deliberately cacheable error response, build it yourself: `setStatus(404)` plus a body and your cache headers.

The hook must be synchronous and return a plain object with a numeric `statusCode` and a string `message`. Anything else (`undefined`, a Promise, an array, a wrong field type) is logged and the original body is sent. If the hook throws, the same happens. The status never changes: it is the error's own, whatever `statusCode` the hook returns. An error response always goes out; even a custom `renderError` that throws falls back to a plain JSON body.

Any other thrown error is converted to `HttpError(500)` with the error's message.

A handler can also **return** an `HttpError` (or any `Error`) instead of throwing it — it is rendered the same way:

```js
app.get('admin', () => {
    if (!isAdmin()) return new HttpError(403, 'Access denied');
    return loadDashboard();
});
```

Returning skips the engine's throw/catch unwinding, so it is slightly cheaper on hot rejecting paths (an auth guard answering `401`, for example). Prefer `throw` from nested helpers and composables, or when the error should fall through to the next handler (see below) — a returned error is the response and never advances.

### Content negotiation

The default response class (`WooksHttpResponse`) renders errors based on the request's `Accept` header:

- `application/json` — JSON body (also the fallback when nothing matches)
- `text/html` — a branded HTML error page
- `text/plain` — plain text

To change the branding of the HTML error page (name, version, link, logo), call `WooksHttpResponse.registerFramework({ version, poweredBy, link, image })`. To replace error rendering entirely, subclass `WooksHttpResponse` (override `renderError`) and pass it to the app: `createHttpApp({ responseClass: MyResponse })`.

### Multiple handlers on one route

When several handlers are registered for the same route, a thrown error advances processing to the next handler — silently for `HttpError`, with a logged error otherwise. Only the last handler's error is rendered as the response.

## Cache-Control

::: tip
If you don't know what Cache-Control is and what it is used for, please read [RFC7231](https://www.rfc-editor.org/rfc/rfc7231#section-7.1)
:::

The `HttpResponse` provides methods for setting cache-related headers:

```js
import { useResponse } from '@wooksjs/event-http';

app.get('static/*', () => {
    const response = useResponse();

    response.setAge('2h 15m');
    response.setExpires('2025-05-05');
    response.setCacheControl({
        mustRevalidate: true,
        noCache: false,
        noStore: false,
        noTransform: true,
        public: true,
        private: 'field',
        proxyRevalidate: true,
        maxAge: '3h 30m 12s',
        sMaxage: '2h 27m 54s',
    });
});
```

**Available methods:**

| Method | Description |
|--------|-------------|
| `setCacheControl(data)` | Sets the `Cache-Control` header from a directive object |
| `setAge(value)` | Sets the `Age` header (seconds, or a duration string like `'2h 15m'`) |
| `setExpires(value)` | Sets the `Expires` header (accepts `Date`, a date `string`, or a timestamp in ms) |
| `setPragmaNoCache(value?)` | Sets `Pragma: no-cache` |

Durations follow the [units rule](#cookies): a number is seconds. The standalone `renderCacheControl(data)` utility (exported from `@wooksjs/event-http`) renders the same directive object into a `Cache-Control` header value string.

## Conditional GET (304)

Any `GET`/`HEAD` response with status `200` that carries a validator is answered with `304 Not Modified` when the client already has it — no opt-in:

```ts
app.get('/doc/:id', async () => {
    const doc = await loadDoc(useRouteParams().get('id'))
    useResponse()
        .setHeader('etag', `"${doc.version}"`)
        .setHeader('last-modified', doc.updatedAt.toUTCString())
        .setHeader('cache-control', 'private, no-cache')
    return doc
})
```

| Request header | Becomes `304` when |
|---|---|
| `If-None-Match` | the response's `ETag` matches an entry (weak comparison: `W/"a"` matches `"a"`; lists and `*` supported). `If-Modified-Since` is then ignored. |
| `If-Modified-Since` (no `If-None-Match`) | the response's `Last-Modified` is not later than it (whole seconds). The header counts only when it is one valid HTTP-date (IMF-fixdate such as `Wed, 21 Oct 2026 07:28:00 GMT`, or the obsolete RFC 850 and asctime forms) that is not in the future; anything else is ignored. |

The `304` drops the body and the representation headers (`Content-Type`, `Content-Length`, `Content-Encoding`, `Content-Language`, `Content-Range`, `Content-MD5`), and keeps the rest (`ETag`, `Last-Modified`, `Cache-Control`, `Vary`, cookies, `Content-Location`, `Content-Security-Policy`). It applies to every body kind — values, streams (the stream is destroyed unread) and returned fetch `Response`s — and to [programmatic fetch](../fetch.md). A `304` you set yourself (`setStatus(304)`) is sent the same way.

The full set of preconditions is evaluated in RFC 9110 order, for any GET/HEAD answer that would be 2xx: `If-Match` (strong comparison; `*` matches the current representation — any response is one) or else `If-Unmodified-Since`. When they fail, the response becomes **`412 Precondition Failed`**, rendered like any other error (the standard error body through `transformErrorBody`; no body for HEAD; never cacheable). Then `If-None-Match` (`*` matches any current representation), else `If-Modified-Since` — those give a `304`, for a `200` only.

A `304` carries the validators the `200` it confirms would carry: with [compression](../compression.md) on, that is the weakened `ETag` of the encoded response (`W/"v7"`) — for the same `Accept-Encoding`.

::: info Conditional headers are read from the request as received
To keep requests without conditional headers cheap, wooks first checks the raw request header names (`req.rawHeaders`) for an `If-*` header. A conditional header that code in front of wooks adds to `req.headers` (and not to `rawHeaders`) is therefore not seen. Synthetic requests without `rawHeaders` (programmatic fetch, test contexts) are judged by `req.headers`.
:::

::: warning `If-Match` needs a strong ETag
`If-Match` uses strong comparison, so a weak tag never satisfies it: an endpoint without a strong `ETag` answers `412` to every `If-Match` that is not `*` (and to a stale `If-Unmodified-Since`). The ETag computed by `prerenderJson({ etag: true })` and any ETag on a compressed response are weak.
:::

#### Lost-update protection (optimistic concurrency)

Send a strong `ETag` with the representation; the client echoes it in `If-Match` on its write, and you refuse the write when the resource changed meanwhile:

```ts
app.get('/doc/:id', async () => {
    const doc = await loadDoc(useRouteParams().get('id'))
    useResponse().setHeader('etag', `"${doc.version}"`).setCompression(false) // keep the tag strong
    return doc
})

app.put('/doc/:id', async () => {
    const doc = await loadDoc(useRouteParams().get('id'))
    const verdict = checkPreconditions('PUT', useHeaders(), { etag: `"${doc.version}"` })
    if (verdict) {
        throw new HttpError(verdict) // 412: someone else changed it — reload and retry
    }
    return saveDoc(doc, await useBody().parseBody())
})
```

**With [response compression](../compression.md) on, the ETag the client receives is weakened** (`"v7"` becomes `W/"v7"`, because the compressed bytes differ from the identity bytes), and echoing that weak tag in `If-Match` always gets `412`. Either have the client send the strong tag (e.g. from a version field in the body, or a header of your own), or turn compression off for resources that use optimistic concurrency: `useResponse().setCompression(false)`, as above.

A HEAD response carries the same headers a GET would: the same `Content-Encoding` / `Vary` negotiation when compression is on (no `Content-Length` next to an encoding, since only GET compresses), and `Content-Length` as GET sends it. A handler that sets `Content-Length` itself and returns no body on HEAD (like `serveFile`) keeps it.

**Don't** expect a `304` for other methods, other statuses (`201`, `206`, errors) or a response without `ETag`/`Last-Modified`. The handler still runs. To skip expensive work — or to refuse a write to a stale copy (lost-update protection) — check first with the same rules:

```ts
import { checkPreconditions, useHeaders, useRequest, useResponse } from '@wooksjs/event-http'

app.get('/report', async () => {
    const { etag, updatedAt } = await reportVersion()
    const response = useResponse().setHeader('etag', etag).setHeader('last-modified', updatedAt.toUTCString())
    const verdict = checkPreconditions(useRequest().method, useHeaders(), { etag, lastModified: updatedAt })
    // pass { exists: false } for a target that has nothing yet (a create), so `If-Match: *` fails
    if (verdict) {
        response.setStatus(verdict) // 304, or 412 (stale If-Match / If-Unmodified-Since, or a matching If-None-Match on a write)
        return
    }
    return buildReport()
})
```

`parseHttpDate(value)` (also exported) parses an HTTP-date the same strict way and returns epoch milliseconds or `undefined`.

## Vary

`useResponse().vary(...headers)` adds request headers the response depends on to `Vary`, merging case-insensitively with what is there (no duplicates, `Vary: *` left alone). Compression adds `Accept-Encoding` and `useAcceptLanguage().negotiate()` adds `Accept-Language` this way.

```ts
useResponse().vary('Cookie', 'Accept-Language')
```

## Pre-serialized JSON & ETag

When many requests return the same large object — a schema, a metadata envelope, a config document built once and cached — `prerenderJson()` serializes it once and remembers the JSON by object identity. Every response that returns that exact object reuses the stored string instead of calling `JSON.stringify` again.

```ts
import { prerenderJson, useResponse } from '@wooksjs/event-http'

const meta = prerenderJson(Object.freeze(buildMeta()), { etag: true })

app.get('/meta', () => {
  useResponse()
    .setHeader('cache-control', 'private, no-cache')
    .setHeader('vary', 'Authorization, Cookie')
  return meta // no re-serialization; 304 when the client already has these bytes
})
```

**Options:**

| Option | Effect |
|--------|--------|
| `etag: true` | Computes a weak `ETag` (`W/"…"`) from the serialized bytes. `GET`/`HEAD` 2xx responses carrying the object get the `ETag` header (other methods get none), so the [conditional GET](#conditional-get-304) rules apply. |
| `etag: '"rev-7"'` | Uses your own entity tag instead (quoted, optionally `W/`-prefixed — anything else throws) — e.g. a version you already have, so nothing is hashed. |

The computed tag (`etag: true`) is **weak**: it serves `If-None-Match` / `304`, but `If-Match` never matches a weak tag, so a request with `If-Match: <that tag>` gets `412`. For optimistic concurrency (`If-Match` on writes and reads), pass a strong tag of your own: `etag: '"rev-7"'`.

The `304` has no body and no `Content-Type`/`Content-Length`; every other header the handler set (`ETag`, `Cache-Control`, `Vary`, cookies) is kept. Because the ETag is a hash of the final bytes, two different bodies never share an ETag — a client that revalidates with an old ETag after its body changed (for example after logging in with another role) gets a `200` with the new body.

**Do:**
- Treat a registered object as immutable. The stored JSON is never refreshed, so build a new object (and register it) instead of changing the old one. Deep-freezing registered objects in development turns an accidental mutation into an error.
- Return the registered object itself. A copy (`{ ...meta }`) is a different object and is serialized normally, without an ETag.
- Send `Cache-Control: private` (plus `no-cache` to force revalidation) and a `Vary` header for responses that differ per user.

**Don't:**
- Expect `304` on errors or non-`200` responses — thrown `HttpError`s and responses with another status never become `304` and carry no prerender ETag.
- Combine it with your own `ETag` header by accident — an explicitly set `ETag` wins: it is sent instead, and `If-None-Match` is judged against it.

Registrations are held weakly: when the object is garbage-collected, its stored JSON goes with it. Calling `prerenderJson` again for the same object reuses the stored JSON (it adds a computed ETag if none was requested before; a string `etag` replaces the stored one).

With [response compression](../compression.md) enabled, a registered body is compressed once per coding and the compressed bytes are reused; the weak `ETag` is shared by all codings.

## Compression

Responses can be compressed with brotli or gzip — opt in with `createHttpApp({ compression: true })` and opt a single response out with `useResponse().setCompression(false)`. See [Response Compression](../compression.md) for the rules, options and the BREACH caveat.

## Advanced Members

A few more `HttpResponse` members are useful when integrating with other tooling:

| Member | Description |
|--------|-------------|
| `responded` | `true` once the response has been sent |
| `sendError(error, ctx)` | Renders and sends an `HttpError` (called automatically when a handler throws) |
| `toWebResponse()` | Builds a Web Standard `Response` from the accumulated state (used by [programmatic fetch](../fetch.md)) |
| `setCompression(value)` / `compression` | Per-response compression override and the effective settings — see [Response Compression](../compression.md#per-response-control) |

The `recordToWebHeaders(record)` utility (exported from `@wooksjs/event-http`) converts a Node-style headers record (`Record<string, string | string[]>`) into Web Standard `Headers`.

## Proxy

You can feed a `fetch` response to your response by simply returning it from your handler.
For advanced proxy functionality, use the separate package `@wooksjs/http-proxy`. See the [Proxy documentation](../proxy.md).

## Serve Static

Static file serving is provided by the separate package `@wooksjs/http-static`. See the [Serve Static documentation](../static.md).
