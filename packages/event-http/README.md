# @wooksjs/event-http

**!!! This is work-in-progress library, breaking changes are expected !!!**

<p align="center">
<img src="../../logo.png" width="128px"><br>
<a  href="https://github.com/wooksjs/wooksjs/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" />
</a>
</p>

As a part of `wooks` event processing framework, `@wooksjs/event-http` implements http events and provides composables that let you:
- parse urls search params
- parse cookies
- parse request body (json, url-encoded, form, ...)
- serve files

### The main ideas behind composable functions are:

1. Never mutate request object (`req`). Accumulate a request context in a separate object(s) instead (`wooks store`);
2. Never parse anything (cookies, body) before it is really requested by the request handler;
3. Get rid of complex predefined data objects containing everything (cookies, headers, body, parsed body etc.) and use composable functions (hooks) instead;
4. Get rid of tons of dependencies (middlewares) and implement everything that is needed for web app in a simple way.

### Official Wooks HTTP composables:

- [@wooksjs/http-body](https://github.com/wooksjs/wooksjs/tree/main/packages/http-body) - to parse body
- [@wooksjs/http-static](https://github.com/wooksjs/wooksjs/tree/main/packages/http-static) - to serve static files
- [@wooksjs/http-proxy](https://github.com/wooksjs/wooksjs/tree/main/packages/http-proxy) - to proxy requests

## Install

`npm install wooks @wooksjs/event-http`

## Quick Start

```js
import { Wooks, useRouteParams } from 'wooks'
import { WooksHttp } from '@wooksjs/event-http'

const app = new Wooks()

app.on('GET', 'hello/:name', () => `Hello ${ useRouteParams().get('name') }!`)

app.subscribe(new WooksHttp(3000, () => {
    console.log('Wooks Server is up on port 3000')
}))
```

## Shortcuts

You can use `get`, `post`, ... methods directly with `shortcuts` feature:

```js
import { useRouteParams, Wooks } from 'wooks'
import { httpShortcuts, WooksHttp } from '@wooksjs/event-http'

const app = new Wooks().shortcuts(httpShortcuts)

app.get('hello/:name', () => `Hello ${ useRouteParams().get('name') }!`)

app.subscribe(new WooksHttp(3000))
```

## Quick Navigation
 - [User Documentation](./README.md#User-Documentation)
 - [URL Parameters](./README.md#)
 - [Query Parameters](./README.md#Query-Parameters)
---
 - [Request](./README.md#Request)
 - [Request Method and Headers](./README.md#Request-Method-and-Headers)
 - [Request Cookies](./README.md#Request-Cookies)
 - [Request Authorization](./README.md#Request-Authorization)
 - [Request Body Parser](./README.md#Request-Body-Parser)
---
 - [Response](./README.md#Response)
 - [Response Headers](./README.md#Response-Headers)
 - [Response Cookies](./README.md#Response-Cookies)
 - [Response Status](./README.md#Response-Status)
 - [Cache-Control](./README.md#Cache-Control)
 - [Proxy Requests](./README.md#Proxy-Requests)
 - [Serve File](./README.md#Serve-File)
---
 - [Create you own hooks](./README.md#Create-you-own-hooks)
---
 - [Adapter Documentation](./README.md#Adapter-Documentation)
 - [Create a new wooks context](./README.md#Create-a-new-wooks-context)
 - [Create a responder](./README.md#Create-a-responder)
 - [Restore Context](./README.md#Restore-Context)

## User Documentation

### URL Parameters
To get access to URL parameters use composable function `useRouteParams`

```js
import { useRouteParams } from 'wooks'
app.get('parametric/:param1/:param2/...', () => {
    const { params, get } = useRouteParams()
    // presume we had a request on `/parametric/value1/value2`
    console.log('param1=' + get('param1'))
    // prints "param1=value1"
    console.log('param2=' + get('param2'))
    // prints "param2=value2"
    console.log(params)
    // prints {
    //   param1: "value1",
    //   param2: "value2" 
    // }
})
```

### Query Parameters
To get access to Query parameters use composable function `useSearchParams`

```js
import { useSearchParams } from '@wooksjs/event-http'
app.get('with-query', () => {
    const { jsonSearchParams, urlSearchParams } = useSearchParams()
    // presume we had a request on `/with-query?param1=abc&param2=cde`
    console.log('param1=' + urlSearchParams('param1'))
    // prints "param1=abc"
    console.log('param2=' + urlSearchParams('param2'))
    // prints "param1=cde"
    console.log(jsonSearchParams)
    // prints {
    //   param1: "abc",
    //   param2: "cde"   
    // }
})
```

### Request
To get a reference to the raw request instance use composable function `useRequest`

You probably don't need a `rawRequest` unless you are developing some new feature. All the base use-cases covered with other composable functions.

```js
import { useRequest } from '@wooksjs/event-http'
app.get('test', () => {
    const { rawRequest } = useRequest()
})
```

### Request Method and Headers
`useRequest` provides some more shortcuts for useful data

```js
import { useRequest } from '@wooksjs/event-http'
app.get('test', async () => {
    const { 
        url,        // request url      (string) 
        method,     // request method   (string)
        headers,    // request headers  (object)
        rawBody,    // request body     ((): Promise<Buffer>)
    } = useRequest()

    const body = await rawBody() // body as a Buffer
})
```

### Request Cookies
Cookies are not parsed unless requested. Composable function `useCookies` provides cookie getter and raw cookies string.

```js
import { useCookies } from '@wooksjs/event-http'
app.get('test', async () => {
    const { 
        rawCookies, // "cookie" from headers (string | undefined)
        getCookie,  // cookie getter ((name): string | null)
    } = useCookies()

    console.log(getCookie('session'))
    // prints the value of the cookie with the name "session"
})
```

### Request Authorization
`useAuthorization` function provides useful helpers for auth-headers:

```js
import { useAuthorization } from '@wooksjs/event-http'
app.get('test', async () => {
    const {
        authorization,      // the raw value of "authorization" header : string
        authType,           // the auth type (Bearer/Basic) : string
        authRawCredentials, // the auth credentials that follow auth type : string
        isBasic,            // true if authType === 'Basic' : () => boolean
        isBearer,           // true if authType === 'Bearer' : () => boolean
        basicCredentials,   // parsed basic auth credentials : () => { username: string, password: string }
    } = useAuthorization()

    if (isBasic()) {
        const { username, password } = basicCredentials()
        console.log({ username, password })
    } else if (isBearer()) {
        const token = authRawCredentials
        console.log({ token })
    } else {
        // unknown or empty authorization header
    }
})
```

### Request Body Parser
[More details here](https://github.com/wooksjs/body#readme)

### Response
The easiest way to respond to the request is to return some value from handler function like this:
```js
app.get('string_response', () => {
    return 'hello world!'
    // responds with:
    // 200
    // Content-Length: ...
    // Content-Type: text/plain
    // hello world!
})
```

Whatever is returned from the handler is the response. `Content-Type` and `Content-Length` headers will be calculated accordingly.

If a handler returns a json object, it will be stringified and the header `Content-Type` will be set to `application/json` automatically:
```js
app.get('json_response', () => {
    return { value: 'hello world!' }
    // responds with:
    // 200
    // Content-Length: ...
    // Content-Type: application/json
    // { "value": "hello world!" }
})
```

**Supported response types:**
1. string   (text/plain, text/html, application/xml - depending on the content)
2. object/array (application/json)
3. boolean  (text/plain)
4. readable stream (you must specify `Content-Type` and `Content-Length` headers yourself)
5. fetch (native) response (streaming body to client response)

**Raw Response**: When it is needed to take the full control of the response, use composable function `useResponse`

When you get a raw response instance you take away the control of the response on yourself. The framework will not process the output of the handler in this case.

An example of using raw response instance:
```js
import { useResponse } from '@wooksjs/event-http'
app.get('test', () => {
    const { rawResponse } = useResponse()
    const res = rawResponse()
    res.writeHead(200, {})
    res.end('ok')
})
```

If you don't want to take away a responsibility for the response but still need a raw response instance you can use `{ passthrough: true }` as an argument.
The next example does the same thing as the previous example using `passthrough` options:

```js
import { useResponse } from '@wooksjs/event-http'
app.get('test', () => {
    const { rawResponse } = useResponse()
    const res = rawResponse({ passthrough: true })
    return 'ok'
})
```

### Response Headers
A function `useSetHeaders` provides variety of response headers helpers:

```js
import { useSetHeaders, contentTypes } from '@wooksjs/event-http'
app.get('test', async () => {
    const {
        setHeader,      //sets header: (name: string, value: string | number) => void;
        removeHeader,   //removes header: (name: string) => void;
        setContentType, //sets "Content-Type": (value: string) => void;
        headers,        //Object with response headers: Record<string, string>;
        enableCors,     //sets "Access-Control-Allow-Origin": (origin?: string) => void;
    } = useSetHeaders()

    setContentType(contentTypes.application.json)
    setHeader('server', 'myServer v1.0')
    enableCors()
    return '{ "value": "OK" }'
})
```

Another hook for set header

```js
import { useSetHeader } from '@wooksjs/event-http'
app.get('test', async () => {
    const server = useSetHeader('server')
    server.value = 'myServer v1.0'
})
```

### Response Cookies
A function `useSetCookies` provides variety of set-cookie helpers:

```js
import { useSetCookies } from '@wooksjs/event-http'
app.get('test', async () => {
    const {
        setCookie,      // sets cookie : (name: string, value: string, attrs?) => void;
        removeCookie,   // removes cookie from setlist : (name: string) => void;
        clearCookies,   // removes all the cookies from setlist : () => void;
        cookies,        // returns a value of Set-Cookie header: () => string[];
    } = useSetCookies()

    setCookie('session', 'value', {
        expires: '2029-01-01',  // Date | string | number;
        maxAge:  '1h',          // number | TProstoTimeMultiString;
        domain:  'my-domain',   // string;
        path:    '/home',       // string;
        secure:   true,         // boolean;
        httpOnly: false,        // boolean;
        sameSite: true,         // boolean | 'Lax' | 'None' | 'Strict';
    })
})
```

Another hook for set-cookie

```js
import { useSetCookie } from '@wooksjs/event-http'
app.get('test', async () => {
    const session = useSetCookie('session')
    session.value = 'value'
    session.attrs = {
        expires: '2029-01-01',  // Date | string | number;
        maxAge:  '1h',          // number | TProstoTimeMultiString;
        domain:  'my-domain',   // string;
        path:    '/home',       // string;
        secure:   true,         // boolean;
        httpOnly: false,        // boolean;
        sameSite: true,         // boolean | 'Lax' | 'None' | 'Strict';        
    }
})
```

### Response Status
It's possible to control the response status via `status` function that is available in `useResponse()`

```js
import { useResponse } from '@wooksjs/event-http'
app.get('test', async () => {
    const { status } = useResponse()

    // use function calls:
    status(201) // sets status 201 for the response

    console.log(status()) // when called with no argument returns the status

    // also possible to use value:
    // status.value = 201
    // console.log(status.value)

    return 'response with status 201'
})
```

### Cache-Control
`useSetCacheControl` function provides helpers for headers responsible for cache control

```js
import { useSetCacheControl } from '@wooksjs/event-http'
app.get('static/*', () => {
    const { 
        setAge,             // sets Age (v: number | TProstoTimeMultiString) => void
        setExpires,         // sets Expires (v: Date | string | number) => void
        setPragmaNoCache,   // sets Pragma: no-cache (v: boolean) => void
        setCacheControl,    // sets Cache-Control (data: TCacheControl) => void
    } = useSetCacheControl()

    setAge('2h 15m')
    setExpires('2022-05-05')
    setCacheControl({
        mustRevalidate: true,
        noCache: false,
        noStore: false,
        noTransform: true,
        public: true,
        private: 'field',
        proxyRevalidate: true,
        maxAge: '3h 30m 12s',
        sMaxage: '2h 27m 54s',
    })
})
```

### Proxy Requests
[More details here](https://github.com/wooksjs/proxy#readme)

### Serve File
[More details here](https://github.com/wooksjs/serve-file#readme)

## Create you own hooks

As an example we'll create a composable that resolves user profile

```ts
import { useAuthorization, useHttpContext } from '@wooksjs/event-http'

interface TUser {
    username: string
    age: number
    // ...
}

export function useUserProfile() {
    // 1. get custom-typed context
    const { store } = useHttpContext<{ user: TUser }>()
    const user = store('user')

    // 2. in this example will use basic credentials approach to get user name
    const { basicCredentials } = useAuthorization()

    // 3. get user name
    const username = basicCredentials()?.username

    // 4. user data async loader
    async function userProfile() {
        // first check if user data was already cached
        // for this request
        if (!user.value) {
            // no user data cached yet, try to read user
            // and return the result
            user.value = await readUser()
        }
        // return user profile from cache
        return user.value
    }

    // abstract readUser function
    function readUser(): Promise<TUser> {
        // return db.readUser(username)
    }    

    return {
        username, // we have user name syncronously
        userProfile, // and userProfile as (() => Promise<TUser>)
    }
}

// example of usage of our useUserProfile
app.get('/user', async () => {
    const { username, userProfile } = useUserProfile()
    console.log('username =', username)
    const data = await userProfile()
    return { user: data }
})
```

Example of custom set header hook

```ts
import { useSetHeaders } from '@wooksjs/event-http'
import { attachHook } from '@wooksjs/event-core'

function useHeaderHook(name: string) {
    const { setHeader, headers } = useSetHeaders()

    return attachHook({
        name,
        type: 'header',
    }, {
        get: () => headers()[name] as string,
        set: (value: string | number) => setHeader(name, value),
    })
}

// usage

app.get('/test', () => {
    const myHeader = useHeaderHook('x-my-header')
    myHeader.value = 'header value'
    // *Please note that useSetHeader('x-my-header') will work similarly*
    return 'ok'
})

// result:
// 200
// headers:
// x-my-header: header value
```

## Adapter Documentation

The next paragraph is for those who wants to create threir own adapter and get more control over the wooks.

### Create a new wooks context

Wooks context is a special object that stores:
1. **instance of request** - is used to get data from request
2. **instance of response** - is used to send a response
3. **parsed route params** - usually Web App frameworks put it to `req` (`req.params`)
4. **cache store** - is used to cache alread computed values, e.g. parsed body, parsed cookies, ..., in order to avoid multiple parsing/computetaion of the same entities.

When request is generated by the client a new Wooks context must be created.

`const {restoreCtx, clearCtx} = createHttpContext({ req, res })`

```ts
import { createHttpContext } from '@wooksjs/event-http'

function requestHandler(req, res) {
    const {
        // restoreCtx hook helps to restore wooks context
        // after any async operatuon
        restoreCtx,

        // clearCtx hook helps to clear wooks context
        // when the request is already processed
        clearCtx,

        // store hook to access wooks store of the current ctx
        store,
    } = createHttpContext({
        // request instance
        req,
        // response instance
        res,
    })

    // if req already contains parsed params (req.params)
    // then those will be picked up automatically
    // unless you overwrite it here
    store('routeParams').value = { name: 'value' }
}

```

### Create a responder

Responder is a function that takes any output of the request handler and transforms it into http response, processing headers, cookies, formats etc.

`const {createResponse, respond} = createWooksResponder()`

```ts
import { createWooksResponder, createHttpContext } from '@wooksjs/event-http'

const {createResponse, respond} = createWooksResponder(
    /*renderer, // (optional) instance of TWooksResponseRenderer*/
    /*errorRenderer, // (optional) instance of TWooksResponseRenderer*/
)

async function requestHandler(req, res) {
    // 1. create wooks context
    const {restoreCtx, clearCtx} = createHttpContext({ req, res })
    // 2. process request based on routers/handlers and get the output
    const response = await createHttpContext()
    // 3. restore wooks context
    restoreCtx()
    // 4. respond
    respond(response)
    // 5. clear wooks context
    clearCtx()
}

async function processHandlers() {
    // routing, processing, handling, ...
}

```

### Restore Context

There is one more way to get `restoreCtx` hook besides the one you get when `createHttpContext`

`const { restoreCtx, clearCtx } = useHttpContext()`

```ts
import { useHttpContext } from '@wooksjs/event-http'

async function someHandler() {
    const { restoreCtx, clearCtx } = useHttpContext()
    await ... // some async operations
    restoreCtx()
    // here the wooks context is back
}
```
