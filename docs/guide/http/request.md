# Request

To get a reference to the raw request instance use composable function `useRequest`

You probably don't need a `rawRequest` unless you are developing some new feature. All the base use-cases covered with other composable functions.

```js
import { useRequest } from '@wooksjs/event-http'
app.get('test', () => {
    const { rawRequest } = useRequest()
})
```

## Request Parameters

### URL Parameter

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

### Query Parameter

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


## Request Method and Headers
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

## Request Cookies
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

## Request Authorization
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

## Request Body Parser
[More details here](https://github.com/wooksjs/wooksjs/blob/main/packages/http-body/README.md)
