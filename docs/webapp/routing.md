# Routing

Routing is the initial step in event processing, responsible for directing the event context
to the appropriate event handler.
Routes can be categorized as static or parametric, with parameters parsed from parametric
routes and passed to the handler.

::: info
Wooks utilizes [@prostojs/router](https://github.com/prostojs/router) for routing, and its
documentation is partially included here for easy reference.
:::

The router effectively parses URIs and quickly identifies the corresponding handler.

## Content

[[toc]]

## Parametric routes

Parameters in routes begin with a colon (`:`).
To include a colon in the path without defining a parameter, it must be escaped
with a backslash (`/api/colon\\:novar`).
Parameters can be separated using a hyphen (`/api/:key1-:key2`).
Regular expressions can also be specified for parameters (`/api/time/:hours(\\d{2})h:minutes(\\d{2})m`).

```js
// Simple single param
app.get('/api/vars/:key', () => 'ok')
// Two params separated with a hyphen
app.get('/api/vars/:key1-:key2', () => 'ok')
// Two params with regex
app.get('/api/time/:hours(\\d{2})h:minutes(\\d{2})m', () => 'ok')
// Two params separated with a slash
app.get('/api/user/:name1/:name2', () => 'ok')
// Three params with the same name (leads to an array as a value)
app.get('/api/array/:name/:name/:name', () => 'ok')
```

## Wildcards

Wildcards are denoted by an asterisk (`*`) and offer several options:

1. They can be placed at the beginning, middle, or end of a path.
1. Multiple wildcards can be used.
1. Wildcards can be combined with parameters.
1. Regular expressions can be passed to wildcards.

```js
// The most common usage (matches all URIs that start with `/static/`)
app.get('/static/*', () => 'ok')

// Matches all URIs that start with `/static/` and end with `.js`
app.get('/static/*.js', () => 'ok')

// Matches all URIs that start with `/static/` and have `/test/` in the middle
app.get('/static/*/test/*', () => 'ok')

// Matches all URIs that start with `/static/[numbers]`
app.get('/static/*(\\d+)', () => 'ok')

```

### Optional Parameters

A parametric (wildcard) route can include optional parameters. If you wish to define optional parameters, they should appear at the end of the route. It is not permitted to have obligatory parameters after an optional parameter, and static segments should not appear after optional parameters, except when using `-` and `/` as separators between parameters.

Optional parameters may be omitted when matching a route, and the corresponding handler will still be found.

**Note:**
A parametric route with optional parameters is treated as a wildcard during lookup, which can reduce routing performance. Please use this feature carefully.

To define a parameter (wildcard) as optional, simply add `?` at the end.

```ts
// Optional parameter
router.get('/api/vars/:optionalKey?', () => 'ok')

// Optional wildcard
router.get('/api/vars/:*?', () => 'ok')

// Several optional parameters
router.get('/api/vars/:v1/:v2?/:v3?', () => 'ok')
```

In the above example, the router allows routes with optional parameters to be defined using the `?` symbol at the end of the parameter name. For instance, `/api/vars/myKey` and `/api/vars/` are both valid routes for the first example. Similarly, the second example allows routes like `/api/vars/param1/param2` and `/api/vars/` to be matched. Lastly, the third example permits routes with one, two, or three parameters to be matched, with any combination of parameters being optional.

## Retrieving URI params

When using parametric routes, it's useful to access the parameters.
The `useRouteParams` composable function from `wooks` provides a convenient way to achieve this.

It returns an object containing the params as `JSON` and a `get` function for accessing the values.

```ts
function useRouteParams<
    T extends object = Record<string, string | string[]>
>(): {
    params: T
    get: <K extends keyof T>(name: K) => T[K]
}
```

Usage of `useRouteParams`

::: code-group

```js [ESM]
import { useRouteParams } from 'wooks'
app.get('hello/:name', () => {
    const { get } = useRouteParams()
    return `Hello ${get('name')}!`
})
```

```js [CommonJS]
const { useRouteParams } = require('wooks')
app.get('hello/:name', () => {
    const { get } = useRouteParams()
    return `Hello ${get('name')}!`
})
```

:::

For repeated param names, it returns an array:
::: code-group

```js [ESM]
import { useRouteParams } from 'wooks'
app.get('hello/:name/:name', () => {
    const { get } = useRouteParams()
    return get('name') // Array of names
})
```

```js [CommonJS]
const { useRouteParams } = require('wooks')
app.get('hello/:name/:name', () => {
    const { get } = useRouteParams()
    return get('name') // Array of names
})
```

:::

For wildcards, the name of the param is `*`:
::: code-group

```js [ESM]
import { useRouteParams } from 'wooks'
app.get('hello/*', () => {
    const { get } = useRouteParams()
    return get('*') // Returns everything that follows `hello/`
})
```

```js [CommonJS]
const { useRouteParams } = require('wooks')
app.get('hello/*', () => {
    const { get } = useRouteParams()
    return get('*') // returns everything that follows hello/
})
```

:::

Multiple wildcards are stored as an array, similar to repeated param names.

## Path builders

When defining a new route, a path builder is returned.
Path builders are used to construct paths based on URI params.

::: code-group

```js [javascript]
const { getPath: pathBuilder } = app.get('/api/path', () => 'ok')
console.log(pathBuilder()) // /api/path

const { getPath: userPathBuilder } = app.get('/api/user/:name', () => 'ok')
console.log(
    userPathBuilder({
        name: 'John',
    })
) // /api/user/John

const { getPath: wildcardBuilder } = app.get('/static/*', () => 'ok')
console.log(
    wildcardBuilder({
        '*': 'index.html',
    })
) // /static/index.html

const { getPath: multiParamsBuilder } = app.get('/api/asset/:type/:type/:id', () => 'ok')
console.log(
    userPathBuilder({
        type: ['CJ', 'REV'],
        id: '443551',
    })
) // /api/asset/CJ/REV/443551
```

```ts [typescript]
interface MyParamsType = {
    name: string
}
const { getPath: userPathBuilder } = app.get<string, MyParamsType>('/api/user/:name', () => 'ok')
console.log(userPathBuilder({
    name: 'John'
}))
// /api/user/John
```

:::

## Query Parameters

Query Parameters or URL Search Parameters are not part of the URI path processed by the router.
The router simply ignores everything after `?` or `#`.

To access query parameters, you can use the `useSearchParams` composable function from `@wooksjs/event-http`.
For more details, refer to the [Query Parameters section](./composables/request.md#query-parameters).
