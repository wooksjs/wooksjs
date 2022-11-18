# Wooks

**!!! This is work-in-progress library, breaking changes are expected !!!**

<p align="center">
<img src="../../logo.png" width="128px"><br>
<a  href="https://github.com/prostojs/wooks/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" />
</a>
</p>


Wooks is a Web Application Framework with hooks.

As an alternative for `express` and `fastify`, `wooks` brings the whole different approach for processing http requests.
It utilizes such a technique as you can see in React Hooks or Vue Composables. It has only a dependency on [@prostojs/router](https://github.com/prostojs/router) (an alternative to `find-my-way` used by `fastify`) which is a very fast (see benchmarks [here](https://github.com/prostojs/router-benchmark)) and robust URI router. 

`wooks` supports cookie parsing, proxy and serving files out of the box with no impact on performance.

The main ideas behind wooks are:

1. Never mutate request object (`req`). Accumulate a request context in a separate object(s) instead;
2. Never parse anything (cookies, body) before it is really requested by the request handler;
3. Get rid of complex predefined data objects containing everything (cookies, headers, body, parsed body etc.) and use composable functions (hooks) instead;
4. Get rid of tons of dependencies (middlewares) and implement everything that is needed for web app in a simple way.

`wooks` uses [@wooksjs/composables](https://github.com/wooksjs/composables) under the hood.

### Official Composables packs:

- [@wooksjs/body](https://github.com/wooksjs/body) - to parse body
- [@wooksjs/serve-file](https://github.com/wooksjs/serve-file) - to serve static files
- [@wooksjs/proxy](https://github.com/wooksjs/proxy) - to proxy requests

## Quick Start

```js
import { Wooks } from 'wooks'
// commonjs
// const { Wooks } = require('wooks')

const app = new Wooks()

app.get('test', () => {
    return { message: 'hello world!' }
})

app.listen(3000, () => { console.log('Wooks Server is up on port 3000') })
```

## Install

`npm install wooks`

## Routes

It supports static, parametric and wildcard routes with regex expressions (see details in [@prostojs/router](https://github.com/prostojs/router))

Static route:
```js
app.get('static/route', () => {})
```

Parametric route:
```js
app.get('parametric/:param1/:param2/...', () => {})
```

Wildcard route:
```js
app.get('wildcard/*', () => {})
```

Complex wildcard route (use as many asterisks as you need and even specify a static parts after them):
```js
app.get('wildcard/start-*/*.html', () => {})
```


## URL Parameters

To get access to URL parameters use composable function `useRouteParams`

```js
import { useRouteParams } from '@wooksjs/composables'
app.get('parametric/:param1/:param2/...', () => {
    const { routeParams, getRouteParam } = useRouteParams()
    // presume we had a request on `/parametric/value1/value2`
    console.log('param1=' + getRouteParam('param1'))
    // prints "param1=value1"
    console.log('param2=' + getRouteParam('param2'))
    // prints "param2=value2"
    console.log(routeParams)
    // prints {
    //   param1: "value1",
    //   param2: "value2" 
    // }
})
```

## Query Parameters

To get access to Query parameters use composable function `useSearchParams`

```js
import { useSearchParams } from '@wooksjs/composables'
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

## Composables

[More details on how to use composables here](https://github.com/wooksjs/composables)


## Error Handling
All the exeptions occured in handler are cought by the framework and interpreted as Server Error 500.


```js
app.get('error', () => {
    throw new Error('Some Error')
    // A call of this endpoint will result in
    // 500 Internal Server Error
    // "Some Error"
})
```

By default the Error Handler renders the response according to the `Accept` request header:
- if it accepts 'application/json' then the response will be in JSON format
- else if it accepts 'text/html' then the response will be in HTML format
- else if it accepts 'text/plain' then the response will be rendered in a plain text
- else the response will be in JSON format anyways

It's possible to return your own error:

```js
import { WooksError } from '@wooksjs/composables'
app.get('error', () => {
    throw new WooksError('429', 'My Description')
    // A call of this endpoint will result in
    // 429 Too Many Requests
    // "My Description"
})
```

In this case if you have an alternative (fallback) handler for the same route the error may not occure, the next handler will be called instead.

As an alternative you may not throw the error but return its instance:

```js
import { WooksError } from '@wooksjs/composables'
app.get('error', () => {
    return new WooksError('429', 'My Description')
    // A call of this endpoint will result in
    // 429 Too Many Requests
    // "My Description"
})
```

In this case if you have an alternative (fallback) handler for the same route the error will occure anyways as you explicitly return its instance.

## Fallback Handler

It's possible to assign several handlers for the same route. Every next handler will work as a fallback for the previous one.

The fallback handler is called only when exception is thrown out of the previous handler.

If the previous handler returns an Error Instance then the fallback handler won't be called.

For example you serve files, but for some 'not found' files you want to do something else:

```js
import { Wooks, useRouteParams } from '@wooksjs/composables'
import { serveFile } from '@wooksjs/serve-file'
const app = new Wooks()

app.get('static/*', () => {
    const { getRouteParam } = useRouteParams()
    // serveFile will throw 404 error if the file is not found
    return serveFile(getRouteParam('*'), { maxAge: '10m' })
})

app.get('static/*', () => {
    // this handler will be called every time the file is not found
    return 'Here\'s my fallback response'
})

app.listen(3000)
```

In order to prevent the fallback to be invoked you must return an Error Instance explicitly:

```js
import { Wooks, useRouteParams } from '@wooksjs/composables'
import { serveFile } from '@wooksjs/serve-file'
const app = new Wooks()

app.get('static/*', () => {
    const { getRouteParam } = useRouteParams()
    try {
        return serveFile(getRouteParam('*'), { maxAge: '10m' })
    }
    catch (e) {
        // now we catch error and return it explicitly
        return e
    }
})

app.get('static/*', () => {
    // this handler will be never called now
    return 'Here\'s my fallback response which is never (ever) called'
})

app.listen(3000)
```
