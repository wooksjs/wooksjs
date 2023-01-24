# Response

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

## Response Headers
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

## Response Cookies
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

## Response Status
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

## Cache-Control
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
