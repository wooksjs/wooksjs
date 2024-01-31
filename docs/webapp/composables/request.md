# Request Composables

The request composables provide various functions to interact with the incoming HTTP request in a Wooks HTTP application.
These functions allow you to access different aspects of the request, such as headers, query parameters, cookies, authorization headers, and more.

<!-- Request is an object (`IncomingMessage`) that is generated when an incoming http request hits nodejs server.
That object contains headers, body etc. Headers can be available even before body is loaded.
The event handler is triggered right when `head` has already been received but before `body` is received.
It means that in case of wrong path the router will reply 404 before body was even sent.
It also means that you can check headers/cookies before body is received, then you can make a decision if body is needed, should you parse it or not. -->

## Content

[[toc]]

## Raw Request Instance

To get a reference to the raw request instance, you can use the `useRequest` composable function.
However, in most cases, you won't need to directly access the raw request instance unless
you're developing a new feature or require low-level control over the request.

```js
import { useRequest } from '@wooksjs/event-http'
// cjs:
// const { useRequest } = require('@wooksjs/event-http')

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

- `urlSearchParams()` — returns an instance of `WooksURLSearchParams`, which extends the standard `URLSearchParams` with a `toJson` method that returns a **JSON** object of the query parameters.
- `jsonSearchParams()` — is a shortcut for `urlSearchParams().toJson()`, returning the query parameters as a **JSON** object.
- `rawSearchParams()` — returns the raw search parameter string, such as `?param1=value&...`.

```js
import { useSearchParams } from '@wooksjs/event-http'

app.get('hello', () => {
  const { urlSearchParams, jsonSearchParams, rawSearchParams } = useSearchParams()

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
    authorization, // The raw value of the "authorization" header (string)
    authType, // The authentication type (Bearer/Basic) (string)
    authRawCredentials, // The authentication credentials that follow the auth type (string)
    isBasic, // Returns true if authType === 'Basic' (() => boolean)
    isBearer, // Returns true if authType === 'Bearer' (() => boolean)
    basicCredentials, // Parsed basic auth credentials (() => { username: string, password: string })
  } = useAuthorization()

  if (isBasic()) {
    const { username, password } = basicCredentials()
    console.log({ username, password })
  } else if (isBearer()) {
    const token = authRawCredentials
    console.log({ token })
  } else {
    // Unknown or empty authorization header
  }
})
```

## Body Parser

The implementation of the body parser is isolated into a separate package
called `@wooksjs/http-body`. For more details on using the body parser, refer to the [Body Parser section](../body.md).
