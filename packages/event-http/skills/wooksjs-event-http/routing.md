# Routing — @wooksjs/event-http

> Covers route registration, the full route syntax (params, wildcards, regex constraints, optional segments), HTTP methods, handler return values, router configuration, and path builders. Wooks uses `@prostojs/router` — a high-performance radix-tree router.

## Route Registration

### Method shortcuts

```ts
import { createHttpApp } from '@wooksjs/event-http'

const app = createHttpApp()

app.get('/users', () => { /* GET /users */ })
app.post('/users', () => { /* POST /users */ })
app.put('/users/:id', () => { /* PUT /users/:id */ })
app.patch('/users/:id', () => { /* PATCH /users/:id */ })
app.delete('/users/:id', () => { /* DELETE /users/:id */ })
app.head('/users', () => { /* HEAD /users */ })
app.options('/users', () => { /* OPTIONS /users */ })
```

### Catch-all method

```ts
app.all('/health', () => 'OK')  // matches any HTTP method
```

### Generic `on()` method

```ts
app.on('GET', '/hello', () => 'Hello!')
app.on('CUSTOM', '/rpc', () => 'Custom method')
```

## Route Syntax

### Static routes

Exact path matching with no parameters:

```ts
app.get('/api/status', () => 'ok')
app.get('/about/team', () => 'team page')
```

### Named parameters (`:paramName`)

Captures a single path segment:

```ts
import { useRouteParams } from '@wooksjs/event-http'

app.get('/users/:id', () => {
  const { get } = useRouteParams<{ id: string }>()
  return { userId: get('id') }
})
// GET /users/42 → { userId: '42' }
```

### Multiple parameters

```ts
app.get('/users/:userId/posts/:postId', () => {
  const { params } = useRouteParams<{ userId: string; postId: string }>()
  return params
})
// GET /users/42/posts/7 → { userId: '42', postId: '7' }
```

### Hyphen-separated parameters

Parameters can be separated by hyphens (or other literal characters) within a single segment:

```ts
app.get('/flights/:from-:to', () => {
  const { get } = useRouteParams<{ from: string; to: string }>()
  return { from: get('from'), to: get('to') }
})
// GET /flights/NYC-LAX → { from: 'NYC', to: 'LAX' }
```

### Regex-constrained parameters

Append a regex pattern in parentheses to restrict what a parameter matches:

```ts
// Only match numeric IDs
app.get('/users/:id(\\d+)', () => {
  const { get } = useRouteParams<{ id: string }>()
  return { id: get('id') }
})
// GET /users/42    → matches, { id: '42' }
// GET /users/alice → does NOT match (404)

// Complex: time format
app.get('/schedule/:hours(\\d{2})h:minutes(\\d{2})m', () => {
  const { get } = useRouteParams<{ hours: string; minutes: string }>()
  return { hours: get('hours'), minutes: get('minutes') }
})
// GET /schedule/09h30m → { hours: '09', minutes: '30' }
```

### Repeated parameters (array capture)

Using the same parameter name multiple times captures values as an array:

```ts
app.get('/tags/:tag/:tag/:tag', () => {
  const { get } = useRouteParams<{ tag: string[] }>()
  return { tags: get('tag') }
})
// GET /tags/js/ts/rust → { tags: ['js', 'ts', 'rust'] }
```

### Wildcards (`*`)

Captures arbitrary path segments (including slashes):

```ts
// Prefix wildcard — capture everything after /files/
app.get('/files/*', () => {
  const { get } = useRouteParams<{ '*': string }>()
  return { path: get('*') }
})
// GET /files/docs/readme.txt → { path: 'docs/readme.txt' }

// Suffix wildcard — match specific extensions
app.get('/assets/*.js', () => {
  const { get } = useRouteParams<{ '*': string }>()
  return { file: get('*') }
})
// GET /assets/app.bundle.js → { file: 'app.bundle' }

// Multiple wildcards
app.get('/api/*/v2/*', () => {
  // Each * is captured independently
  const { params } = useRouteParams()
  return params
})

// Regex-constrained wildcard
app.get('/page/*(\\d+)', () => {
  const { get } = useRouteParams<{ '*': string }>()
  return { page: get('*') }
})
// GET /page/42 → matches
// GET /page/abc → does NOT match
```

### Optional parameters (`?`)

Append `?` to make a parameter optional. Optional params must be at the end of the path:

```ts
app.get('/users/:id/:tab?', () => {
  const { get } = useRouteParams<{ id: string; tab?: string }>()
  return { id: get('id'), tab: get('tab') || 'profile' }
})
// GET /users/42       → { id: '42', tab: 'profile' }
// GET /users/42/posts → { id: '42', tab: 'posts' }

// Multiple optional params
app.get('/archive/:year/:month?/:day?', () => {
  const { params } = useRouteParams<{ year: string; month?: string; day?: string }>()
  return params
})
// GET /archive/2024           → { year: '2024' }
// GET /archive/2024/03        → { year: '2024', month: '03' }
// GET /archive/2024/03/15     → { year: '2024', month: '03', day: '15' }

// Optional wildcard
app.get('/docs/:*?', () => {
  const { get } = useRouteParams<{ '*'?: string }>()
  return { path: get('*') || 'index' }
})
```

### Escaping colons

Use `\\:` for literal colons in the path (not parameter delimiters):

```ts
app.get('/time/\\:hours\\::minutes', () => { /* matches /time/:hours:30 literally */ })
```

## Accessing Route Parameters

### `useRouteParams<T>()`

```ts
import { useRouteParams } from '@wooksjs/event-http'

const { params, get } = useRouteParams<{ id: string }>()

params    // full params object: { id: '123' }
get('id') // single param: '123'
```

- Parameters are always `string` or `string[]` (for repeated params).
- Cast numerics yourself: `Number(get('id'))`.
- The generic `<T>` gives type-safe access via `get()`.

## Path Builders

Route registration returns a path handle with a `getPath` builder — useful for generating URLs from parameter objects:

```ts
const userRoute = app.get('/users/:id', handler)
userRoute.getPath({ id: '42' })
// → '/users/42'

const fileRoute = app.get('/files/*', handler)
fileRoute.getPath({ '*': 'docs/readme.txt' })
// → '/files/docs/readme.txt'

const tagRoute = app.get('/tags/:tag/:tag/:tag', handler)
tagRoute.getPath({ tag: ['js', 'ts', 'rust'] })
// → '/tags/js/ts/rust'
```

## Handler Return Values

Handlers return the response body directly. The framework automatically determines the content type and status code:

```ts
// String → text/plain
app.get('/text', () => 'Hello')

// Object/Array → application/json (auto-serialized)
app.get('/json', () => ({ message: 'Hello' }))

// Number → text/plain
app.get('/number', () => 42)

// Boolean → text/plain
app.get('/bool', () => true)

// undefined → 204 No Content
app.get('/empty', () => {})

// Readable stream → streamed response
app.get('/stream', () => createReadStream('/path/to/file'))

// Fetch Response → proxied response
app.get('/proxy', async () => {
  return await fetch('https://api.example.com/data')
})
```

### Default Status Codes (when not explicitly set)

| Method  | Default status |
|---------|---------------|
| GET     | 200 OK        |
| POST    | 201 Created   |
| PUT     | 201 Created   |
| PATCH   | 202 Accepted  |
| DELETE  | 202 Accepted  |
| (empty body) | 204 No Content |

## Async Handlers

Handlers can be async. The framework awaits the returned promise:

```ts
app.get('/data', async () => {
  const data = await fetchFromDatabase()
  return data
})
```

## Router Configuration

Pass router options when creating the app:

```ts
const app = createHttpApp({
  router: {
    ignoreTrailingSlash: true,  // /users and /users/ match the same route
    ignoreCase: true,           // /Users and /users match the same route
    cacheLimit: 1000,           // max cached parsed route lookups (default: 50)
  },
})
```

| Option | Default | Description |
|--------|---------|-------------|
| `ignoreTrailingSlash` | `false` | Treat `/path` and `/path/` as the same route |
| `ignoreCase` | `false` | Case-insensitive route matching |
| `cacheLimit` | `50` | Max number of parsed URL-to-route mappings to cache |

## Custom 404 Handler

```ts
const app = createHttpApp({
  onNotFound: () => {
    const { url, method } = useRequest()
    throw new HttpError(404, `${method} ${url} not found`)
  },
})
```

## Sharing Router Between Adapters

Multiple adapters can share the same Wooks router instance:

```ts
import { Wooks } from 'wooks'
import { createHttpApp } from '@wooksjs/event-http'

const wooks = new Wooks()
const app1 = createHttpApp({}, wooks)
const app2 = createHttpApp({}, wooks)  // shares the same routes
```

Or share via another adapter:

```ts
const app1 = createHttpApp()
const app2 = createHttpApp({}, app1)  // shares app1's router
```

## Common Patterns

### Pattern: RESTful Resource

```ts
const app = createHttpApp()

// List
app.get('/api/users', async () => {
  return await db.listUsers()
})

// Get by ID
app.get('/api/users/:id(\\d+)', async () => {
  const { get } = useRouteParams<{ id: string }>()
  const user = await db.findUser(Number(get('id')))
  if (!user) throw new HttpError(404, 'User not found')
  return user
})

// Create
app.post('/api/users', async () => {
  const { parseBody } = useBody()
  const data = await parseBody<{ name: string; email: string }>()
  return await db.createUser(data)
})

// Update
app.patch('/api/users/:id(\\d+)', async () => {
  const { get } = useRouteParams<{ id: string }>()
  const { parseBody } = useBody()
  const data = await parseBody<Partial<User>>()
  return await db.updateUser(Number(get('id')), data)
})

// Delete
app.delete('/api/users/:id(\\d+)', async () => {
  const { get } = useRouteParams<{ id: string }>()
  await db.deleteUser(Number(get('id')))
})
```

### Pattern: Static File Server with API

```ts
// API routes (more specific) are matched first
app.get('/api/status', () => ({ status: 'ok' }))
app.get('/api/users/:id', () => { /* ... */ })

// Static catch-all
app.get('/*', () => {
  const { get } = useRouteParams<{ '*': string }>()
  return serveFile(get('*') || 'index.html', { baseDir: './public' })
})
```

### Pattern: Versioned API

```ts
app.get('/api/v1/users', () => handleV1Users())
app.get('/api/v2/users', () => handleV2Users())

// Or with a parameter
app.get('/api/:version(v\\d+)/users', () => {
  const { get } = useRouteParams<{ version: string }>()
  if (get('version') === 'v1') return handleV1Users()
  return handleV2Users()
})
```

## Best Practices

- **Use typed generics on `useRouteParams<T>()`** for type-safe parameter access.
- **Use regex constraints** to validate params at the routing level: `:id(\\d+)` prevents non-numeric IDs from even reaching your handler.
- **Prefer method shortcuts** (`app.get()`, `app.post()`) over `app.on()` for readability.
- **Return objects directly** — the framework serializes to JSON automatically.
- **Use `app.all()`** for routes that respond to any HTTP method (health checks, CORS preflight fallbacks).
- **Use path builders** when you need to generate URLs programmatically (e.g., for `Location` headers in redirects).
- **Avoid optional parameters when possible** — they reduce routing performance since the router must check multiple path variants. Prefer explicit routes.

## Gotchas

- **Route paths should not include query strings** — use `useSearchParams()` to access query parameters.
- **Parameters are always strings** — cast numerics yourself: `Number(get('id'))`.
- **Wildcard `*` captures everything** after its position, including slashes — `'/files/*'` matches `/files/`, `/files/a`, `/files/a/b/c`.
- **Optional params must be at the end** of the path. `/users/:id?/posts` is invalid.
- **Regex patterns use double backslashes** in string literals: `':id(\\d+)'` not `':id(\d+)'`.
- **URL-encoded characters are handled correctly** — the router decodes `%20`, `%2F`, etc. before matching. You get the decoded values in params.
- **Route precedence**: static segments match before parametric, parametric before wildcard. More specific routes always win.
