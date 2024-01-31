# Proxy Requests

The `@wooksjs/http-proxy` package provides a convenient way to proxy requests in Wooks HTTP.
It allows you to easily proxy requests to another server or API.

## Installation

To use the proxy functionality, you need to install the `@wooksjs/http-proxy` package:

```bash
npm install @wooksjs/http-proxy
```

## Usage

Once installed, you can import and use the `useProxy` composable function in your WooksJS application.

Example:

```js
import { useProxy } from '@wooksjs/http-proxy'

app.get('/to-proxy', () => {
  const proxy = useProxy()
  return proxy('https://target-website.com/target-path?query=123')
})
```

The `useProxy` function returns a function that you can call with the target URL you want to proxy.
The function will make the proxy request and return the `fetch` response from the target server.

## Restrict cookies/headers to pass

You can restrict the cookies and headers that are passed in the proxy request by specifying
the `reqCookies` and `reqHeaders` options in the `useProxy` function.

Example:

```js
import { useProxy } from '@wooksjs/http-proxy'

app.get('/to-proxy', () => {
  const proxy = useProxy()
  return proxy('https://target-website.com/target-path?query=123', {
    reqHeaders: { block: ['referer'] }, // Block the referer header
    reqCookies: { block: '*' }, // Block all request cookies
  })
})
```

In the example above, the referer header is blocked, and all request cookies are blocked from being passed in the proxy request.

## Change Response

The proxy function returned by `useProxy` behaves like a regular fetch call and returns a `fetch` response.
You can modify the response or access its data before returning it from the handler.

Example:

```js
import { useProxy } from '@wooksjs/http-proxy'

app.get('/to-proxy', async () => {
  const proxy = useProxy()
  const response = proxy('https://mayapi.com/json-api')
  const data = { ...(await response.json()), newField: 'new value' }
  return data
})
```

In the example above, the `proxy` function is used to make the proxy request,
and the response is then modified by adding a new field before returning it from the handler.

## Advanced Options

The `useProxy` function provides advanced options for customizing the proxy behavior.
You can specify options such as the request method, filtering request and response headers/cookies, overwriting data, and enabling debug mode.

Example:

```js
import { useProxy } from '@wooksjs/http-proxy'
import { useRequest } from '@wooksjs/composables'

app.get('*', async () => {
  const proxy = useProxy()
  const { url } = useRequest()
  const fetchResponse = await proxy('https://www.google.com' + url, {
    method: 'GET', // Optional method, defaults to the original request method

    // Filtering options for request headers/cookies
    reqHeaders: { block: ['referer'] },
    reqCookies: { allow: ['cookie-to-pass-upstream'] },

    // Filtering options for response headers/cookies
    resHeaders: { overwrite: { 'x-proxied-by': 'wooks-proxy' } },
    resCookies: { allow: ['cookie-to-pass-downstream'] },

    debug: true, // Enable debug mode to print proxy paths and headers/cookies
  })

  return fetchResponse
})
```

In the example above, advanced options such as the request method, filtering of headers/cookies, overwriting response headers,
and enabling debug mode are demonstrated. You can customize these options based on your specific requirements.

The `fetchResponse` returned by the proxy function can be directly returned from the handler.
You can also modify the response or access its data before returning it.

That's how you can use the `@wooksjs/http-proxy` package to proxy requests in your Wooks HTTP application.
