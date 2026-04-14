# Routing — @prostojs/router

## Table of Contents

1. [Overview](#overview)
2. [Configuration](#configuration)
3. [Parametric Routes](#parametric-routes)
4. [Wildcards](#wildcards)
5. [Optional Parameters](#optional-parameters)
6. [Escaping Special Characters](#escaping-special-characters)
7. [Retrieving Route Params](#retrieving-route-params)
8. [Path Builders](#path-builders)
9. [Query Parameters](#query-parameters)
10. [Route Priority](#route-priority)
11. [Adapter-Specific Methods](#adapter-specific-methods)
12. [Best Practices](#best-practices)
13. [Gotchas](#gotchas)

---

## Overview

All wooksjs adapters (HTTP, CLI, WebSocket, Workflows) share the same router from `@prostojs/router`.
Routes are registered per adapter, but the pattern syntax is identical everywhere. The router
parses paths, extracts parameters, and resolves handlers. Query strings (`?` and `#`) are ignored.

---

## Configuration

Router options are passed when creating an app or a `Wooks` instance:

```ts
const app = createHttpApp({
  router: {
    ignoreTrailingSlash: true,  // /path and /path/ treated as same (default: false)
    ignoreCase: true,           // case-insensitive matching (default: false)
    cacheLimit: 100,            // cache N resolved paths for faster repeat lookups (default: 0)
  },
})
```

| Option                 | Type      | Default | Description                                         |
| ---------------------- | --------- | ------- | --------------------------------------------------- |
| `ignoreTrailingSlash`  | `boolean` | `false` | Treat `/path` and `/path/` as identical             |
| `ignoreCase`           | `boolean` | `false` | Case-insensitive route matching                     |
| `cacheLimit`           | `number`  | `0`     | Cache resolved path→route mappings (0 = disabled)   |

---

## Parametric Routes

Parameters begin with a colon (`:`).

```ts
// Single parameter
app.get('/api/users/:id', handler)
// Matches: /api/users/123 → { id: '123' }

// Two params separated by hyphen
app.get('/api/:key1-:key2', handler)
// Matches: /api/hello-world → { key1: 'hello', key2: 'world' }

// Two params separated by slash
app.get('/api/user/:first/:last', handler)
// Matches: /api/user/john/doe → { first: 'john', last: 'doe' }

// Same name repeated → array value
app.get('/api/array/:name/:name/:name', handler)
// Matches: /api/array/a/b/c → { name: ['a', 'b', 'c'] }
```

### Regex constraints

Constrain parameters with regex in parentheses:

```ts
// Digits only
app.get('/api/item/:id(\\d+)', handler)
// Matches: /api/item/42 ✓    /api/item/abc ✗

// Time format
app.get('/api/time/:hours(\\d{2})h:minutes(\\d{2})m', handler)
// Matches: /api/time/14h30m → { hours: '14', minutes: '30' }

// Filename with extension
app.get('/api/file/:name([a-z]+\\.txt)', handler)
// Matches: /api/file/readme.txt → { name: 'readme.txt' }
```

---

## Wildcards

Wildcards use asterisk (`*`). Can appear at beginning, middle, or end. Results stored under `'*'`.

```ts
// Match everything after /static/
app.get('/static/*', handler)
// Matches: /static/css/main.css → { '*': 'css/main.css' }

// Suffix filter
app.get('/static/*.js', handler)
// Matches: /static/app.js, /static/vendor/lib.js

// Multiple wildcards → array
app.get('/static/*/test/*', handler)
// Matches: /static/v1/test/data.js → { '*': ['v1', 'data.js'] }

// Wildcard with regex
app.get('/static/*(\\d+)', handler)
// Matches: /static/12345 (digits only)
```

---

## Optional Parameters

Add `?` after a parameter name to make it optional. Optional parameters **must be at the end** of
the route.

```ts
app.get('/api/vars/:optionalKey?', handler)
// Matches: /api/vars/ AND /api/vars/myKey

app.get('/api/vars/:*?', handler)
// Matches: /api/vars/ AND /api/vars/anything/here

app.get('/api/vars/:v1/:v2?/:v3?', handler)
// Matches: /api/vars/a, /api/vars/a/b, /api/vars/a/b/c
```

**Performance note:** Routes with optional parameters are treated as wildcards during lookup,
which is slower than static or parametric matching. Use sparingly.

---

## Escaping Special Characters

Escape a colon with backslash to use it literally (not as a parameter):

```ts
app.get('/api/colon\\:novar', handler)
// Matches: /api/colon:novar (literal colon)

// Useful in CLI where colons appear in commands
app.cli('app build\\:dev', handler)
// Matches: app build:dev
```

---

## Retrieving Route Params

Use `useRouteParams()` inside any handler (works across all adapters):

```ts
import { useRouteParams } from '@wooksjs/event-http' // or event-cli, event-ws, event-core

app.get('/hello/:name', () => {
  const { params, get } = useRouteParams<{ name: string }>()
  return `Hello ${get('name')}!`
})
```

**Signature:**

```ts
function useRouteParams<T extends Record<string, string | string[]>>(): {
  params: T
  get: <K extends keyof T>(name: K) => T[K]
}
```

**Repeated params → array:**

```ts
app.get('/hello/:name/:name', () => {
  const { get } = useRouteParams()
  return get('name') // string[] — e.g. ['alice', 'bob']
})
```

**Wildcards → `'*'` key:**

```ts
app.get('/static/*', () => {
  const { get } = useRouteParams()
  return get('*') // string — e.g. 'css/main.css'
})
// Multiple wildcards → string[]
```

---

## Path Builders

Route registration returns a handle with `getPath()` to construct URLs from parameters:

```ts
const { getPath } = app.get('/api/user/:name', handler)
getPath({ name: 'John' })  // '/api/user/John'

const { getPath } = app.get('/static/*', handler)
getPath({ '*': 'index.html' })  // '/static/index.html'

const { getPath } = app.get('/api/asset/:type/:type/:id', handler)
getPath({ type: ['CJ', 'REV'], id: '443551' })  // '/api/asset/CJ/REV/443551'
```

**Handle properties:**

| Property        | Type      | Description                                |
| --------------- | --------- | ------------------------------------------ |
| `getPath(params?)` | `function` | Build a URL path from parameters        |
| `getStaticPart()` | `function` | First static segment before any variables |
| `getArgs()`     | `function` | List of parameter names in order           |
| `isStatic`      | `boolean` | No parameters or wildcards                 |
| `isParametric`  | `boolean` | Has parameters                             |
| `isWildcard`    | `boolean` | Has wildcards                              |

---

## Query Parameters

The router ignores everything after `?` or `#`. Use `useUrlParams()` from `@wooksjs/event-http`
to access query parameters. See [http-request.md](http-request.md#useurlparamsctx).

---

## Route Priority

Matching order (fastest to slowest):

1. **Static** — exact path lookup (O(1) object key match)
2. **Parametric** — compiled regex, grouped by segment count
3. **Wildcard / Optional** — linear scan in registration order

Within the same category, routes registered first take priority.

---

## Adapter-Specific Methods

All adapters use the same router, but expose different registration APIs:

### HTTP (`@wooksjs/event-http`)

```ts
app.get(path, ...handlers)       // also: post, put, patch, delete, head, options
app.all(path, ...handlers)       // matches any HTTP method
app.on('GET', path, ...handlers) // generic method
```

### CLI (`@wooksjs/event-cli`)

```ts
app.cli(path, handler)           // registers with method 'CLI'
app.cli(path, options, handler)  // with command metadata
```

Path segments can use space or `/` (equivalent): `'install :package'` = `'/install/:package'`.

### WebSocket (`@wooksjs/event-ws`)

```ts
ws.onMessage(event, path, handler) // routes by event type + path
```

### Workflows (`@wooksjs/event-wf`)

```ts
app.step(id, opts)               // step ID is a router path (method: 'WF_STEP')
app.flow(id, schema)             // flow ID is a router path (method: 'WF_FLOW')
```

### Shared router

Multiple adapters can share one router via the same Wooks instance:

```ts
const wooks = new Wooks()
const http = new WooksHttp(wooks)
const ws = new WooksWs(http)        // shares router with http
const wf = createWfApp({}, http)    // shares router with http
```

---

## Best Practices

- Prefer static routes over parametric for known paths — faster lookup.
- Use regex constraints to avoid ambiguous matches: `:id(\\d+)` vs `:slug`.
- Use optional params sparingly — they degrade to wildcard performance.
- Enable `cacheLimit` in production for frequently accessed parametric routes.
- Use `ignoreTrailingSlash: true` to avoid 404s from trailing slash mismatches.
- Use path builders (`getPath()`) to construct URLs rather than string concatenation.

---

## Gotchas

- **Optional params must be terminal** — no required segments after optional ones.
- **Same-name params create arrays** — `/:a/:a` yields `{ a: ['x', 'y'] }`, not overwrite.
- **Wildcards capture everything** — `/static/*` matches `/static/a/b/c/d`.
- **Colon is always a param marker** — escape with `\\:` for literal colons.
- **CLI paths normalize** — spaces and `/` are equivalent separators.
- **Duplicate routes accumulate handlers** — registering the same path twice creates a handler chain, not a replacement.
- **URL decoding is automatic** — `%20`, `%2F` etc. are decoded before matching.
- **Query strings ignored** — the router never sees `?key=value`.
