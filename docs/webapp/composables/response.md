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
5. `Readable` stream (you must specify `Content-Type` yourself)
6. `fetch` `Response` (status, headers, and body forwarded — see below)

Instead of returning a value, you can also set the body explicitly on the response instance — `useResponse().setBody(data)` (chainable) or the `body` property.

### Returning a fetch `Response`

When a handler returns a `fetch` `Response`, its status, headers, and body are forwarded to the client:

- The `Response` status is used unless a status was already set via `useResponse()`.
- All headers from the `Response` are forwarded. Headers already set via `useResponse()` take precedence.
- Multiple `Set-Cookie` headers are preserved; cookies set via `setCookie()` are sent first.
- The body is streamed.

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

You can pre-populate response headers for every request via the `defaultHeaders` option on `createHttpApp`. The `securityHeaders()` utility provides a curated set of recommended HTTP security headers.

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
        expires: '2029-01-01', // Date | string | number
        maxAge: '1h',          // number | TTimeMultiString
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
| `GET` with body | 200 OK |
| `POST` / `PUT` with body | 201 Created |
| `PATCH` / `DELETE` with body | 202 Accepted |
| No body | 204 No Content |

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

The constructor takes a status code (default `500`) and a message string or a structured body object. The rendered body always has the shape `{ statusCode, message, error }`; extra fields of a structured body are merged in:

```js
throw new HttpError(400, { statusCode: 400, message: 'Validation failed', fields: ['name'] });
// { statusCode: 400, message: 'Validation failed', error: 'Bad Request', fields: ['name'] }
```

The structured body type requires `statusCode`, but the rendered value always comes from the constructor's status-code argument.

Any other thrown error is converted to `HttpError(500)` with the error's message.

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
| `setAge(value)` | Sets the `Age` header (accepts `number` or time string like `'2h 15m'`) |
| `setExpires(value)` | Sets the `Expires` header (accepts `Date`, `string`, or `number`) |
| `setPragmaNoCache(value?)` | Sets `Pragma: no-cache` |

The standalone `renderCacheControl(data)` utility (exported from `@wooksjs/event-http`) renders the same directive object into a `Cache-Control` header value string.

## Advanced Members

A few more `HttpResponse` members are useful when integrating with other tooling:

| Member | Description |
|--------|-------------|
| `responded` | `true` once the response has been sent |
| `sendError(error, ctx)` | Renders and sends an `HttpError` (called automatically when a handler throws) |
| `toWebResponse()` | Builds a Web Standard `Response` from the accumulated state (used by [programmatic fetch](../fetch.md)) |

The `recordToWebHeaders(record)` utility (exported from `@wooksjs/event-http`) converts a Node-style headers record (`Record<string, string | string[]>`) into Web Standard `Headers`.

## Proxy

You can feed a `fetch` response to your response by simply returning it from your handler.
For advanced proxy functionality, use the separate package `@wooksjs/http-proxy`. See the [Proxy documentation](../proxy.md).

## Serve Static

Static file serving is provided by the separate package `@wooksjs/http-static`. See the [Serve Static documentation](../static.md).
