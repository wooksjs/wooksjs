# Error Handling — @wooksjs/event-http

> Covers throwing HTTP errors, custom error bodies, error rendering, and error flow.

## Concepts

In Wooks, errors are raised by throwing an `HttpError` instance. The framework catches it and renders an appropriate error response based on the client's `Accept` header (JSON, HTML, or plain text).

Any uncaught `Error` thrown in a handler is automatically wrapped as a 500 Internal Server Error.

## `HttpError`

```ts
import { HttpError } from '@wooksjs/event-http'
```

### Basic usage

```ts
app.get('/users/:id', async () => {
  const user = await db.findUser(id)
  if (!user) {
    throw new HttpError(404, 'User not found')
  }
  return user
})
```

This produces a response like:

```json
{ "statusCode": 404, "error": "Not Found", "message": "User not found" }
```

### Status code only

```ts
throw new HttpError(403)
// → { "statusCode": 403, "error": "Forbidden", "message": "" }
```

The `error` field is automatically populated from the standard HTTP status text.

### Custom error body

Pass an object as the second argument for additional fields:

```ts
throw new HttpError(422, {
  message: 'Validation failed',
  statusCode: 422,
  fields: {
    email: 'Invalid email format',
    age: 'Must be positive',
  },
})
```

Response:

```json
{
  "statusCode": 422,
  "error": "Unprocessable Entity",
  "message": "Validation failed",
  "fields": {
    "email": "Invalid email format",
    "age": "Must be positive"
  }
}
```

### Constructor signature

```ts
class HttpError<T extends TWooksErrorBody = TWooksErrorBody> extends Error {
  constructor(
    code: THttpErrorCodes = 500,  // HTTP status code (4xx, 5xx)
    body: string | T = '',         // message string or structured body
  )

  get body(): TWooksErrorBodyExt  // always returns { statusCode, message, error, ...extra }
}
```

### Error body shape

```ts
interface TWooksErrorBody {
  message: string
  statusCode: EHttpStatusCode
  error?: string
}

// Extended (always has error string)
interface TWooksErrorBodyExt extends TWooksErrorBody {
  error: string  // e.g. 'Not Found', 'Internal Server Error'
}
```

## Error Flow

1. Handler throws `HttpError` → framework catches it
2. Error body is constructed via `httpError.body` getter
3. `HttpErrorRenderer` checks the `Accept` header:
   - `application/json` → JSON response
   - `text/html` → styled HTML error page
   - `text/plain` → plain text
   - fallback → JSON
4. Status code from the error is set on the response

### Uncaught errors

Any non-`HttpError` thrown in a handler is wrapped as a 500:

```ts
app.get('/crash', () => {
  throw new Error('something broke')
  // → 500 Internal Server Error: "something broke"
})
```

### Error in handler chain

If multiple handlers are registered for a route, an error in a non-last handler falls through to the next handler. Only the last handler's error is sent as the response:

```ts
// This is the internal behavior — typically you register one handler per route
```

## Common Patterns

### Pattern: Guard function

```ts
function requireAuth() {
  const { isBearer, authRawCredentials } = useAuthorization()
  if (!isBearer()) {
    throw new HttpError(401, 'Authentication required')
  }
  const token = authRawCredentials()!
  const user = verifyToken(token)
  if (!user) {
    throw new HttpError(401, 'Invalid token')
  }
  return user
}

app.get('/protected', () => {
  const user = requireAuth()
  return { message: `Hello ${user.name}` }
})
```

### Pattern: Validation with details

```ts
function validateBody(data: unknown): asserts data is CreateUserDTO {
  const errors: Record<string, string> = {}

  if (!data || typeof data !== 'object') {
    throw new HttpError(400, 'Request body must be an object')
  }

  const body = data as Record<string, unknown>
  if (!body.email) errors.email = 'Required'
  if (!body.name) errors.name = 'Required'

  if (Object.keys(errors).length > 0) {
    throw new HttpError(422, {
      message: 'Validation failed',
      statusCode: 422,
      fields: errors,
    })
  }
}
```

### Pattern: Not Found with context

```ts
app.get('/users/:id', async () => {
  const { get } = useRouteParams<{ id: string }>()
  const id = get('id')
  const user = await db.findUser(id)
  if (!user) {
    throw new HttpError(404, `User with id "${id}" not found`)
  }
  return user
})
```

### Pattern: Custom 404 handler

```ts
const app = createHttpApp({
  onNotFound: () => {
    const { url } = useRequest()
    throw new HttpError(404, `Route ${url} does not exist`)
  },
})
```

## Available Status Codes

`HttpError` accepts any valid HTTP error status code. Common ones:

| Code | Meaning |
|------|---------|
| 400 | Bad Request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 405 | Method Not Allowed |
| 408 | Request Timeout |
| 409 | Conflict |
| 413 | Payload Too Large |
| 415 | Unsupported Media Type |
| 416 | Range Not Satisfiable |
| 422 | Unprocessable Entity |
| 429 | Too Many Requests |
| 500 | Internal Server Error |
| 502 | Bad Gateway |
| 503 | Service Unavailable |

The `EHttpStatusCode` enum from `@wooksjs/event-http` provides all standard codes.

## Built-in Error Responses

The framework automatically throws `HttpError` in certain situations:

| Situation | Code | Message |
|-----------|------|---------|
| No route matched | 404 | (empty) |
| Body too large (compressed) | 413 | Payload Too Large |
| Body too large (inflated) | 413 | Inflated body too large |
| Compression ratio too high | 413 | Compression ratio too high |
| Unsupported Content-Encoding | 415 | Unsupported Content-Encoding "..." |
| Body read timeout | 408 | Request body timeout |
| Malformed JSON body | 400 | (parse error message) |
| Missing form-data boundary | 400 | form-data boundary not recognized |

## Best Practices

- **Throw `HttpError`, don't return error objects** — The framework detects `HttpError` specially and renders it with correct status and content negotiation.
- **Use meaningful status codes** — 400 for bad input, 401 for missing auth, 403 for insufficient permissions, 404 for not found, 422 for validation errors.
- **Include context in error messages** — `"User with id 42 not found"` is more useful than `"Not found"`.
- **Use guard functions** — Extract auth/validation into reusable functions that throw on failure.

## Gotchas

- Throwing a plain `Error` (not `HttpError`) results in a 500 with the error's message exposed. In production, you may want to catch and wrap errors to avoid leaking internals.
- `HttpError.body` always includes an `error` field with the standard HTTP status text, even if you didn't provide one.
