# Request Composables

Composables for reading incoming HTTP request data: headers, query parameters, cookies, authorization, body size limits.

[[toc]]

## Raw Request Instance

To get a reference to the raw request instance, you can use the `useRequest` composable function.
However, in most cases, you won't need to directly access the raw request instance unless
you're developing a new feature or require low-level control over the request.

```js
import { useRequest } from '@wooksjs/event-http'

app.get('/test', () => {
    const { rawRequest } = useRequest()
    // Access the raw request instance if needed
})
```

## URI Parameters

URI parameters are automatically parsed by the router
and are covered in the [Retrieving URI Parameters section](../routing.md#retrieving-uri-params).

## Query Parameters

The `useSearchParams` composable provides three functions for working with query parameters:

-   `urlSearchParams()` — returns an instance of `WooksURLSearchParams`, which extends the standard `URLSearchParams` with a `toJson` method that returns a **JSON** object of the query parameters.
-   `jsonSearchParams()` — is a shortcut for `urlSearchParams().toJson()`, returning the query parameters as a **JSON** object.
-   `rawSearchParams()` — returns the raw search parameter string, such as `?param1=value&...`.

```js
import { useSearchParams } from '@wooksjs/event-http'

app.get('hello', () => {
    const { urlSearchParams, jsonSearchParams, rawSearchParams } =
        useSearchParams()

    // curl http://localhost:3000/hello?name=World
    console.log(jsonSearchParams()) // { name: 'World' }
    console.log(rawSearchParams()) // ?name=World

    return `Hello ${urlSearchParams().get('name')}!`
})
```

Example usage with cURL:

```bash
curl http://localhost:3000/hello?name=World
# Hello World!
```

## Method and Headers

The `useRequest` composable provides additional shortcuts for accessing useful data related to the request, such as the URL, method, headers, and the raw request body.

```js
import { useRequest } from '@wooksjs/event-http'

app.get('/test', async () => {
    const {
        url, // Request URL (string)
        method, // Request method (string)
        headers, // Request headers (object)
        rawBody, // Request body (() => Promise<Buffer>)
    } = useRequest()

    const body = await rawBody() // Body as a Buffer
})

```

## Cookies

Cookies are not automatically parsed unless requested. The `useCookies` composable function provides a cookie getter and access to the raw cookies string.

```js
import { useCookies } from '@wooksjs/event-http'

app.get('/test', async () => {
    const {
        rawCookies, // Raw "cookie" from headers (string | undefined)
        getCookie, // Cookie getter ((name) => string | null)
    } = useCookies()

    console.log(getCookie('session'))
    // Prints the value of the cookie with the name "session"
})
```

## Authorization

The `useAuthorization` function provides helpers for working with authorization headers:

```js
import { useAuthorization } from '@wooksjs/event-http'

app.get('/test', async () => {
    const {
        authorization, // The raw value of the "authorization" header (string | undefined)
        authType, // The authentication type (Bearer/Basic) (() => string | null)
        authRawCredentials, // The credentials that follow the auth type (() => string | null)
        authIs, // Checks auth type: authIs('basic'), authIs('bearer'), etc. ((type) => boolean)
        basicCredentials, // Parsed basic auth credentials (() => { username, password } | null)
    } = useAuthorization()

    if (authIs('basic')) {
        const { username, password } = basicCredentials()
        console.log({ username, password })
    } else if (authIs('bearer')) {
        const token = authRawCredentials()
        console.log({ token })
    } else {
        // Unknown or empty authorization header
    }
})
```

Note: `authorization` is a plain string value. All other properties are lazy functions — they compute on first call and cache the result.

## Accept Header

The `useAccept` composable checks the request's `Accept` header for MIME type support:

```js
import { useAccept } from '@wooksjs/event-http'

app.get('/test', () => {
    const { accept, accepts } = useAccept()

    // Use short names for common types
    if (accepts('json')) {
        return { data: 'json response' }
    } else if (accepts('html')) {
        return '<p>html response</p>'
    }

    // Or full MIME types for anything else
    if (accepts('image/webp')) {
        // ...
    }
})
```

Short names: `'json'` (application/json), `'html'` (text/html), `'xml'` (application/xml), `'text'` (text/plain). Full MIME strings are also accepted.

The `accept` property returns the raw `Accept` header value.

## Body Size Limits

Request body reading is protected by configurable limits:

| Limit | Default | Description |
|-------|---------|-------------|
| `maxCompressed` | 1 MB | Max compressed body size in bytes |
| `maxInflated` | 10 MB | Max decompressed body size in bytes |
| `maxRatio` | 100 | Max compression ratio (zip-bomb protection) |
| `readTimeoutMs` | 10 000 ms | Body read timeout |

### App-level configuration

```js
import { createHttpApp } from '@wooksjs/event-http'

const app = createHttpApp({
    requestLimits: {
        maxCompressed: 50 * 1024 * 1024,  // 50 MB
        maxInflated: 100 * 1024 * 1024,   // 100 MB
        maxRatio: 200,
        readTimeoutMs: 30_000,
    },
})
```

### Per-request overrides

Override limits inside a handler before reading the body:

```js
import { useRequest } from '@wooksjs/event-http'

app.post('/upload', async () => {
    const {
        setMaxCompressed,
        setMaxInflated,
        setMaxRatio,
        setReadTimeoutMs,
        rawBody,
    } = useRequest()

    // Raise limits for this route only
    setMaxCompressed(50 * 1024 * 1024)  // 50 MB
    setMaxInflated(100 * 1024 * 1024)   // 100 MB

    const body = await rawBody()
    return { size: body.length }
})
```

Per-request setters use copy-on-write — they do not mutate the app-level configuration.

## Body Parser

The implementation of the body parser is isolated into a separate package
called `@wooksjs/http-body`. For more details on using the body parser, refer to the [Body Parser section](../body.md).
