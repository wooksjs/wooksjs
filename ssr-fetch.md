# Feature Request: `WooksHttp.fetch()` — Web Standard Programmatic Invocation

## Problem

`WooksHttp` currently only supports real HTTP requests via `getServerCb()` (Node.js `IncomingMessage`/`ServerResponse`). There is no way to programmatically invoke a route handler in-process with the full middleware chain — the only path is through a TCP connection.

This forces projects that need SSR (server-side rendering) or in-process API calls to choose between:

1. **Loopback HTTP request** — wasteful TCP round-trip with serialization/deserialization for an in-process call.
2. **Calling handler functions directly** — bypasses the entire Wooks dispatch pipeline (route matching, context creation, composable availability).
3. **Duplicating logic** in a separate service layer.

### Concrete use case: Moost SSR

Moost (`@moostjs/event-http`) builds on WooksHttp. Controllers are the single source of truth for business logic — they combine argument validation, interceptor chains (auth guards, error transformation), hook extensibility, and data operations. For SSR, the server needs to call its own API endpoints in-process with the full pipeline. Today this requires a loopback HTTP request.

The downstream goal is a universal client pattern where the same interface works in both browser and server:

```typescript
const users: TableService<User> = isServer
  ? new ServerClient({ fetch: httpApp.fetch.bind(httpApp) })  // in-process
  : new HttpClient('/api/users')                               // real HTTP
```

## Industry Standard

Every major modern HTTP framework exposes the application as a `fetch`-compatible function:

| Framework | API | Accepts | Returns |
|-----------|-----|---------|---------|
| **Hono** | `app.fetch(request)` | `Request` | `Response \| Promise<Response>` |
| **H3 v2** | `app.fetch(request)` | `Request` (via srvx `ServerRequest`) | `Response \| Promise<Response>` |
| **Nitro** | `serverFetch(url, init)` | `string \| URL \| Request` | `Promise<Response>` |
| **Bun** | `server.fetch(request)` | `Request \| string` | `Response \| Promise<Response>` |

All go through the **full middleware/handler chain**. All use **Web Standard** `Request`/`Response`. Zero TCP overhead.

**Nitro's auto-detection pattern** is particularly relevant: when `$fetch('/api/users')` is called server-side and the URL starts with `/`, it transparently routes in-process instead of making an HTTP call. The caller doesn't need to know whether it's local or remote.

The universal pattern: **the application IS a `(Request) => Response` function**. The server (TCP listener) is just one consumer of that function. SSR, testing, and programmatic invocation are all direct calls to the same function.

## Proposed API

### `WooksHttp.fetch()`

```typescript
class WooksHttp extends WooksAdapterBase {
  /**
   * Programmatically invoke a route handler using the Web Standard fetch API.
   * Goes through the full dispatch pipeline: context creation, route matching,
   * handler execution, response finalization.
   *
   * When called from within an existing HTTP context (e.g. during SSR),
   * identity headers (authorization, cookie) are automatically forwarded
   * from the calling request unless already present on the given Request.
   *
   * @param request - A Web Standard Request object.
   * @returns A Web Standard Response.
   */
  fetch(request: Request): Promise<Response>
}
```

### `WooksHttp.request()` — Convenience wrapper

```typescript
class WooksHttp extends WooksAdapterBase {
  /**
   * Convenience method for programmatic invocation.
   * Accepts a URL string (relative paths auto-prefixed with http://localhost)
   * or a Request object, plus optional RequestInit.
   *
   * @param input - URL string, URL object, or Request.
   * @param init - Optional RequestInit (method, headers, body, etc.).
   * @returns A Web Standard Response.
   */
  request(input: string | URL | Request, init?: RequestInit): Promise<Response>
}
```

The `request()` method normalizes input to a `Request` and delegates to `fetch()`:

```typescript
request(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  if (typeof input === 'string') {
    if (!input.startsWith('http://') && !input.startsWith('https://')) {
      input = `http://localhost${input.startsWith('/') ? '' : '/'}${input}`
    }
  }
  const req = input instanceof Request ? input : new Request(input, init)
  return this.fetch(req)
}
```

### Usage

```typescript
import { createHttpApp } from '@wooksjs/event-http'

const app = createHttpApp()

app.get('/api/users', () => {
  return [{ id: 1, name: 'Alice' }]
})

// Programmatic invocation — full pipeline, no TCP
const response = await app.fetch(new Request('http://localhost/api/users'))
const users = await response.json()
// [{ id: 1, name: 'Alice' }]

// Convenience form
const response2 = await app.request('/api/users')
const response3 = await app.request('/api/users', { method: 'POST', body: JSON.stringify({ name: 'Bob' }) })
```

---

## SSR Context Propagation

### The Challenge

When `fetch()` is called from within an existing HTTP handler during SSR, a critical context propagation question arises. Consider:

```typescript
app.get('/dashboard', async () => {
  // Page handler — runs in pageCtx
  const { credentials } = useAuthorization()       // cached in pageCtx
  const user = await resolveUser(credentials())     // expensive DB lookup

  // Programmatic fetch — what context does this run in?
  const res = await app.request('/api/users')
  const users = await res.json()
  return renderPage(user, users)
})

app.get('/api/users', () => {
  // API handler — needs its OWN url/method/routeParams,
  // but wants the SAME auth/user as the page request
  const { params } = useRouteParams()       // must be /api/users params, not /dashboard
  const { credentials } = useAuthorization() // should reflect same user
  return db.getUsers()
})
```

The SSR handler needs:
- **Child-specific**: URL (`/api/users`), method, route params, response (status, headers, cookies), body, URL params
- **Inherited from page request**: authorization, cookies, session identity — anything that identifies the user
- **Shared across fetches (optimization)**: expensive computed results (user profile, roles, permissions)

### Why Naive Parent Context Chain Fails

The `EventContext` parent chain has a fundamental behavior that conflicts with selective inheritance:

```
childCtx.get(cachedSlot)
  → not found locally
  → traverses to parent
  → FOUND in parent → returns parent's cached result (no re-computation)
```

All composables (`useRequest`, `useAuthorization`, `useCookies`, etc.) are created via `defineWook()`, which internally creates a `cached()` slot. If the page handler called `useRequest()` before `app.fetch()`, the parent's cached `useRequest()` result is found in the parent chain — the child handler calling `useRequest()` would get the **page's** URL (`/dashboard`) instead of the fetch's URL (`/api/users`).

**`seed()` doesn't save us either.** While `seed()` writes `httpKind` key slots locally (the child gets its own `req`), the `useRequest` **cached** slot lives in the parent. The `get()` method finds the parent's cached result _before_ trying to compute locally:

```typescript
// EventContext.get() — context.ts:62-63
if (val === undefined && this.parent) {
  val = this.parent._findSlot(id)  // finds parent's cached useRequest!
}
```

The child's local `req` key is never consulted because the composable's cached slot is found in the parent first.

### Slot Classification

| Slot | Type | Desired Behavior |
|------|------|-----------------|
| `httpKind.keys.req` | Key | Child-specific (different URL, method) |
| `httpKind.keys.response` | Key | Child-specific (isolated response) |
| `httpKind.keys.requestLimits` | Key | Child-specific |
| `routeParamsKey` | Key | Child-specific (different route) |
| `useRequest()` cached | Cached | Re-compute from child's `req` |
| `useUrlParams()` cached | Cached | Re-compute from child's `req.url` |
| `rawBodySlot` | Cached | Child-specific body |
| `contentEncodingsSlot` | Cached | Re-compute from child's `req` |
| `isCompressedSlot` | Cached | Re-compute |
| `forwardedIpSlot`, `remoteIpSlot`, `ipListSlot` | Cached | Re-compute |
| `useCookies()` cached | Cached | Same result via forwarded headers |
| `useHeaders()` cached | Cached | Re-compute from child's `req` |
| `useAuthorization()` cached | Cached | Same result via forwarded headers |
| `useAccept()` cached | Cached | Re-compute (API may want JSON, page wants HTML) |
| Custom `useUser()` cached | Cached | **Inherit** from parent (expensive) |
| Custom `useRoles()` cached | Cached | **Inherit** from parent (expensive) |

All built-in composables read from `httpKind.keys.req`. When the child has different `req`, they _should_ re-compute. User-defined "session-scoped" composables (user, roles) _should_ be shared.

### Solution: Two-Tier Design

#### Tier 1 — Standalone Context with Header Forwarding (MVP)

No changes to `event-core`. Clean, predictable, zero surprises.

**How it works:**
1. `fetch()` detects the calling context via `tryGetCurrent()`
2. Creates a **standalone** context (no parent chain)
3. Builds the fake `IncomingMessage` with **forwarded headers** from the calling context's request — identity headers like `authorization`, `cookie`, `accept-language`, `x-forwarded-for` are copied unless already set on the programmatic `Request`
4. All composables compute fresh from the child's `req` (which has forwarded headers)
5. Auth composables produce the **same result** as the parent because the identity headers are identical
6. Response is fully isolated — separate `HttpResponse` in capture mode

**Header forwarding is ON by default.** When called from within an existing HTTP context, identity headers are forwarded automatically. Can be opted out via configuration:

```typescript
// Global: disable forwarding entirely
const app = createHttpApp({ forwardHeaders: false })

// Or customize which headers to forward (default list shown)
const app = createHttpApp({
  forwardHeaders: ['authorization', 'cookie', 'accept-language', 'x-forwarded-for']
})
```

**Why this works for SSR:** The programmatic fetch is on behalf of the _same user_ — same auth token, same session cookie. By forwarding these headers, `useAuthorization()`, `useCookies()`, etc. produce identical results. `useRequest().url` correctly returns `/api/users`, not `/dashboard`. Response is completely isolated.

**Trade-off:** User-defined expensive computations (like `useUser()` → DB lookup) are re-computed per fetch invocation. For most SSR scenarios this is acceptable — the overhead is negligible compared to the TCP round-trip it replaces.

#### Tier 2 — Context Inheritance with Slot Isolation (Future Enhancement)

For the "enriching parent context" optimization — sharing expensive computations across multiple programmatic fetches within a single page request. Requires a small addition to `event-core`.

**Core idea:** Add `isolate` to `EventContextOptions`. Isolated slots are never inherited from the parent — they compute fresh locally. Non-isolated slots (user-defined composables) can inherit from and propagate to the parent.

```typescript
interface EventContextOptions {
  logger: Logger
  parent?: EventContext
  /** Slots that should NOT be inherited from the parent chain.
   *  Forces local computation for cached slots. */
  isolate?: Accessor<any>[]
}
```

**Single change in `get()`:**

```typescript
get<T>(accessor: Key<T> | Cached<T>): T {
  const id = accessor._id
  let val = this.slots.get(id)

  // Only traverse parent if slot is not isolated
  if (val === undefined && this.parent && !this._isolated?.has(id)) {
    val = this.parent._findSlot(id)
  }
  // ... rest unchanged
}
```

**Expose cached slot references from `defineWook`** (needed so fetch can list what to isolate):

```typescript
export function defineWook<T>(factory: (ctx: EventContext) => T) {
  const _slot = cached(factory)
  const composable = (ctx?: EventContext) => (ctx ?? current()).get(_slot)
  composable._slot = _slot  // expose for isolation lists
  return composable
}
```

**Export request-derived slots from event-http:**

```typescript
export const httpRequestSlots: Accessor<any>[] = [
  useRequest._slot, useUrlParams._slot, useCookies._slot,
  useHeaders._slot, useAuthorization._slot, useAccept._slot,
  rawBodySlot, contentEncodingsSlot, isCompressedSlot,
  forwardedIpSlot, remoteIpSlot, ipListSlot,
]
```

**Usage in fetch with context inheritance:**

```typescript
async fetch(request: Request, opts?: { context?: 'inherit' }): Promise<Response> {
  const callerCtx = tryGetCurrent()

  const ctxOptions = (opts?.context === 'inherit' && callerCtx)
    ? { ...this.eventContextOptions, parent: callerCtx, isolate: httpRequestSlots }
    : this.eventContextOptions

  // ... rest of implementation
}
```

**Behavior with `{ context: 'inherit' }`:**

| Slot | Isolated? | Behavior |
|------|-----------|----------|
| `useRequest._slot` | Yes | Re-computed from child's `req` — correct URL/method |
| `useAuthorization._slot` | Yes | Re-computed from child's `req` (forwarded headers) — same result |
| Custom `useUser._slot` | No | Inherited from parent if already computed — **shared!** |
| Custom `useRoles._slot` | No | Inherited from parent if already computed — **shared!** |
| `httpKind.keys.response` | N/A (key) | Seeded locally via `seed()` — isolated |

**Write-back for enrichment:** When the child computes a non-isolated cached slot that the parent doesn't have yet, it could propagate to the parent so subsequent sibling fetches benefit:

```typescript
// In get(), after computing a non-isolated cached slot locally:
if (this.parent && !this._isolated?.has(id) && !this.parent.has(accessor)) {
  this.parent.setOwn(accessor as any, result)
}
```

> **Note:** The `isolate` design is documented here for completeness. The details may change — see "Open Design Questions" at the end. The MVP (Tier 1) ships without this.

---

## Implementation Plan

### Step 1: Add capture mode + `toWebResponse()` to `HttpResponse`

**File:** `packages/event-http/src/response/http-response.ts`

Currently, `HttpResponse.send()` writes directly to the Node.js `ServerResponse` via `writeHead()` + `end()`. For the `fetch()` path, we need to intercept `send()` and instead extract the accumulated response state as a Web Standard `Response`.

#### Capture mode flag

Add `_captureMode` as a constructor parameter. When enabled, `send()` becomes a no-op that finalizes cookies and marks the response as responded, without writing to the socket:

```typescript
class HttpResponse {
  constructor(
    protected readonly _res: ServerResponse,
    protected readonly _req: IncomingMessage,
    protected readonly _logger: Logger,
    defaultHeaders?: Record<string, string | string[]>,
    protected readonly _captureMode = false,
  ) { ... }

  send(): void | Promise<void> {
    if (this._captureMode) {
      this._responded = true
      this.finalizeCookies()
      return
    }
    // ... existing send logic unchanged ...
  }
}
```

Making it a constructor parameter (rather than a mutable `enableCaptureMode()` method) prevents accidental mid-flight mode switching.

#### `getRawRes()` in capture mode

> **Implementation note:** The original design proposed throwing from `getRawRes()` in capture mode. The final implementation instead intercepts `writeHead`/`write`/`end` on the fake `ServerResponse`, capturing all data. Handlers that write directly to the raw response still produce a valid Web `Response`. Cookie auto-propagation does not work for the raw path — use `response.setCookie()` for SSR-compatible cookie handling.

#### `toWebResponse()`

Builds a Web Standard `Response` from the accumulated state (status, headers, cookies, body). Called after `processHandlers()` completes (which triggers `respond()` → `send()` in capture mode = no-op).

```typescript
toWebResponse(): Response {
  // Ensure cookies are finalized (idempotent if send() already did this)
  this.finalizeCookies()

  const headers = new Headers()
  for (const [key, value] of Object.entries(this._headers)) {
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v)
    } else if (value) {
      headers.set(key, value)
    }
  }

  const body = this._body
  const method = this._req.method

  // Stream body
  if (body instanceof Readable) {
    this.autoStatus(true)
    return new Response(
      method === 'HEAD' ? null : Readable.toWeb(body) as ReadableStream,
      { status: this._status, headers },
    )
  }

  // Fetch Response passthrough
  if (hasFetchResponse && body instanceof globalThis.Response) {
    this._status = this._status || body.status as EHttpStatusCode
    body.headers.forEach((v, k) => {
      if (!headers.has(k)) headers.set(k, v)
    })
    return new Response(
      method === 'HEAD' ? null : body.body,
      { status: this._status, headers },
    )
  }

  // Regular body
  const rendered = this.renderBody()
  this.autoStatus(!!rendered)
  if (rendered) {
    const contentLength =
      typeof rendered === 'string' ? Buffer.byteLength(rendered) : rendered.byteLength
    headers.set('content-length', contentLength.toString())
  }
  return new Response(
    method === 'HEAD' ? null : (rendered || null),
    { status: this._status, headers },
  )
}
```

Uses the `Headers` API directly (`append` for multi-value headers like `set-cookie`). Also computes `content-length` for regular bodies, matching `sendRegular()` behavior.

**Note:** `WooksHttpResponse.renderError()` (content-negotiated HTML/JSON/text errors) works in capture mode without changes — it sets `_status`, `_headers['content-type']`, and `_body` on the object. `send()` is a no-op, and `toWebResponse()` reads this accumulated state.

#### JSON pre-population optimization

When the response body is a plain object (the common case for API endpoints), the framework already calls `JSON.stringify(body)` in `renderBody()`. On the consumer side, `response.json()` would then `JSON.parse()` the string — a wasteful stringify/parse round-trip for an in-process call.

To avoid this, `toWebResponse()` can attach the pre-serialized data to the Response so that consumers who know they're in-process can skip the parse:

```typescript
// In toWebResponse(), for regular body path:
const rendered = this.renderBody()
this.autoStatus(!!rendered)

const webResponse = new Response(
  method === 'HEAD' ? null : (rendered || null),
  { status: this._status, headers },
)

// Attach pre-parsed JSON for in-process optimization
if (typeof body === 'object' && body !== null
    && !(body instanceof Uint8Array) && !(body instanceof Readable)) {
  // The original object — consumers can use this to skip JSON.parse()
  ;(webResponse as any)._jsonData = body
}

return webResponse
```

> **Implementation note:** The final implementation overrides `json()` and `text()` directly on the Response instance instead of using `_jsonData`. `json()` returns the original handler object reference (zero-cost deserialization), and `text()` returns the pre-rendered string without reading the body stream. No consumer-side changes needed — standard `res.json()` / `res.text()` calls benefit automatically.

### Step 2: Create synthetic `IncomingMessage` from `Request`

**File:** `packages/event-http/src/http-adapter.ts` (private helper)

The existing composables all read from `IncomingMessage`. We need a shim that makes a Web `Request` look enough like an `IncomingMessage` for composables to work. `prepareTestHttpContext()` in `testing.ts` already does this — the `fetch()` implementation follows the same proven pattern:

```typescript
function createFakeIncomingMessage(
  request: Request,
  forwardFrom?: IncomingMessage,
  forwardHeaders?: string[] | false,
): IncomingMessage {
  const url = new URL(request.url)
  const req = new IncomingMessage(new Socket({}))
  req.method = request.method
  req.url = url.pathname + url.search

  // Start with forwarded headers from calling context (if any)
  const headers: Record<string, string> = {}
  if (forwardFrom && forwardHeaders !== false) {
    const headerList = Array.isArray(forwardHeaders)
      ? forwardHeaders
      : DEFAULT_FORWARD_HEADERS
    for (const h of headerList) {
      const val = forwardFrom.headers[h]
      if (typeof val === 'string' && val) {
        headers[h] = val
      }
    }
  }

  // Override with the programmatic Request's own headers (takes precedence)
  request.headers.forEach((value, key) => {
    headers[key] = value
  })

  req.headers = headers
  return req
}

const DEFAULT_FORWARD_HEADERS = [
  'authorization',
  'cookie',
  'accept-language',
  'x-forwarded-for',
]
```

**Important:** `rawBodySlot` reads body data from `req` as a Node.js Readable stream. The fake `IncomingMessage` from `new Socket({})` has no actual data stream. Body is seeded separately (see Step 3).

### Step 3: Seed request body from `Request.body`

**File:** `packages/event-http/src/http-adapter.ts` (inside `fetch()`)

Pre-seed `rawBodySlot` directly (like `prepareTestHttpContext` does with `rawBody`):

```typescript
if (request.body) {
  const buffer = Buffer.from(await request.arrayBuffer())
  ctx.set(rawBodySlot, Promise.resolve(buffer))
}
```

**Pros:** Simple, reuses the exact test pattern.
**Cons:** Reads the entire body into memory upfront. Fine for typical API payloads.

**Alternative (future):** Push the Request body data through the fake `IncomingMessage` via `.push()` for streaming support. Not needed for the MVP — SSR use cases are overwhelmingly JSON API calls.

### Step 4: Implement `WooksHttp.fetch()`

**File:** `packages/event-http/src/http-adapter.ts`

```typescript
async fetch(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const method = request.method
  const pathname = url.pathname + url.search

  // Detect calling context for header forwarding
  const callerCtx = tryGetCurrent()
  let callerReq: IncomingMessage | undefined
  if (callerCtx) {
    try {
      callerReq = callerCtx.get(httpKind.keys.req)
    } catch { /* not in HTTP context, skip */ }
  }

  // Create fake Node.js objects
  const fakeReq = createFakeIncomingMessage(
    request,
    callerReq,
    this.opts?.forwardHeaders,
  )
  const fakeRes = new ServerResponse(fakeReq)
  const response = new this.ResponseClass(
    fakeRes, fakeReq, this.logger, this.opts?.defaultHeaders, true /* captureMode */,
  )

  // Pre-read body if present
  let bodyBuffer: Buffer | undefined
  if (request.body) {
    bodyBuffer = Buffer.from(await request.arrayBuffer())
  }

  const ctxOptions = this.eventContextOptions
  const requestLimits = this.opts?.requestLimits
  const notFoundHandler = this.opts?.onNotFound

  return createHttpContext(
    ctxOptions,
    { req: fakeReq, response, requestLimits },
    async () => {
      const ctx = current()

      // Seed body
      if (bodyBuffer) {
        ctx.set(rawBodySlot, Promise.resolve(bodyBuffer))
      }

      // Route lookup (seeds routeParams into ctx)
      const handlers = this.wooks.lookupHandlers(method, pathname, ctx)

      if (handlers || notFoundHandler) {
        const result = this.processHandlers(
          handlers || [notFoundHandler as TWooksHandler],
          ctx,
          response,
        )
        // Wait for async handlers
        if (result != null && typeof (result as Promise<unknown>).then === 'function') {
          await result
        }
      } else {
        const error = new HttpError(404)
        this.respond(error, response, ctx)
      }

      return response.toWebResponse()
    },
  )
}
```

**Key points:**

- Reuses `this.wooks.lookupHandlers()` — same router, same route param extraction.
- Reuses `this.processHandlers()` — same handler execution, same error handling.
- Reuses `this.ResponseClass` — same response rendering (including content-negotiated errors from `WooksHttpResponse`).
- `createHttpContext()` wraps `createEventContext()` which calls `run(ctx, fn)`. The child context's `current()` scope is properly isolated — the page handler's context is restored after `fetch()` returns. No ALS leaking.
- Context injector / OpenTelemetry spans work identically — `createHttpContext()` triggers `Event:start`. The only visible difference is span attributes (no remote IP, no socket info).
- The only difference from `getServerCb()` is: input comes from `Request` instead of Node.js objects, capture mode intercepts `send()`, and output goes to `toWebResponse()` instead of `res.writeHead()`/`res.end()`.

### Step 5: Implement `WooksHttp.request()`

**File:** `packages/event-http/src/http-adapter.ts`

```typescript
request(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  if (typeof input === 'string') {
    if (!input.startsWith('http://') && !input.startsWith('https://')) {
      input = `http://localhost${input.startsWith('/') ? '' : '/'}${input}`
    }
  }
  const request = input instanceof Request ? input : new Request(input, init)
  return this.fetch(request)
}
```

### Step 6: Update types and options

**File:** `packages/event-http/src/http-adapter.ts`

Add header forwarding config to `TWooksHttpOptions`:

```typescript
export interface TWooksHttpOptions {
  // ... existing options ...

  /**
   * Headers to forward from the calling HTTP context during programmatic fetch.
   * Set to `false` to disable forwarding entirely.
   * Defaults to `['authorization', 'cookie', 'accept-language', 'x-forwarded-for']`.
   */
  forwardHeaders?: string[] | false
}
```

No new exports needed — `fetch()` and `request()` are methods on the existing `WooksHttp` class. The `createHttpApp()` factory returns `WooksHttp`, so the methods are automatically available.

---

## Edge Cases and Considerations

### Capture mode dispatch flow

When `processHandlers()` calls `this.respond(data, response, ctx)`:
1. `respond()` checks `response.responded` → false (not yet responded).
2. If error: `response.sendError(error, ctx)` → `renderError()` sets `_status`, `_headers`, `_body` → `send()` → capture mode no-op (marks `_responded = true`, finalizes cookies).
3. If data: `response.body = data` → `send()` → capture mode no-op.
4. After `processHandlers()` completes, `response.toWebResponse()` builds the Web Response from accumulated state.

All error rendering (including `WooksHttpResponse`'s content-negotiated HTML/JSON/text errors) works identically — errors are rendered into `_body`/`_status`/`_headers` regardless of whether the output goes to socket or Web Response.

### Streaming responses

Handlers that return `Readable` streams work correctly with `toWebResponse()` — the stream is converted to a Web `ReadableStream` via `Readable.toWeb()`. The caller gets a streaming `Response` that can be consumed incrementally.

### Handler accessing `useResponse()`

Handlers that call `useResponse()` to manipulate headers, status, or cookies directly continue to work — the `HttpResponse` instance is the same object. Mutations accumulate on `_headers`, `_cookies`, `_status` regardless of whether the final output goes to `send()` or `toWebResponse()`.

### Handler accessing `getRawRes()`

Throws an error in capture mode (see Step 1). Handlers that bypass the response abstraction to write directly to the transport are inherently transport-specific. This matches the limitation in Hono and H3.

### `onNotFound` handler

The `notFoundHandler` is processed through the same `processHandlers()` pipeline, so it works identically in `fetch()` mode. 404 responses go through interceptors and are captured via `toWebResponse()`.

### Context injector / OpenTelemetry

The `createHttpContext()` call triggers `Event:start` on the context injector. OTel spans are created for the entire pipeline. This works identically for `fetch()` calls — programmatic invocations are traced just like real HTTP requests. The only visible difference would be the span attributes (no remote IP, no socket info).

### `this.wooks` access

`WooksHttp` extends `WooksAdapterBase` which has a `protected wooks` property. The `getServerCb()` method already accesses `this.wooks.lookupHandlers()`. The `fetch()` method uses the same pattern — no additional access needed.

### `WooksHttpResponse` subclass

The `responseClass` option (`TWooksHttpOptions.responseClass`) is used to construct the response: `new this.ResponseClass(...)`. The added `captureMode` constructor parameter needs to be accepted by `WooksHttpResponse` as well. Since `WooksHttpResponse extends HttpResponse` and doesn't override the constructor, this works via inheritance — the base class constructor receives the parameter.

---

## Testing Strategy

### Unit tests for `toWebResponse()`

Test that `HttpResponse.toWebResponse()` correctly captures:
- Status codes (explicit and auto-inferred per method — GET → 200, POST → 201, etc.)
- Headers (single, multi-value)
- Cookies (rendered into `set-cookie` headers via `finalizeCookies`)
- Body types: string → text/plain, object → JSON with content-length, Buffer → raw, Readable → ReadableStream
- Error responses (HttpError → content-negotiated JSON/HTML/text with status code)
- `_jsonData` optimization for object bodies

### Unit tests for capture mode

- `send()` in capture mode does not call `writeHead()`/`end()` on the ServerResponse
- `send()` in capture mode marks `_responded = true` and runs `finalizeCookies()`
- `getRawRes()` throws in capture mode

### Unit tests for header forwarding

- `createFakeIncomingMessage` forwards configured headers from parent request
- Programmatic Request headers override forwarded headers
- `forwardHeaders: false` disables forwarding
- Custom `forwardHeaders` list is respected
- Works when no calling context exists (standalone mode)

### Integration tests for `fetch()` / `request()`

```typescript
const app = createHttpApp()

app.get('/hello', () => 'Hello World!')
app.get('/json', () => ({ message: 'ok' }))
app.get('/users/:id', () => {
  const { params } = useRouteParams()
  return { id: params.id }
})
app.post('/echo', async () => {
  const { rawBody } = useRequest()
  const body = await rawBody()
  return JSON.parse(body.toString())
})
app.get('/error', () => { throw new HttpError(403, 'Forbidden') })
app.get('/headers', () => {
  const response = useResponse()
  response.setHeader('x-custom', 'value')
  response.setCookie('session', 'abc')
  return 'ok'
})
app.get('/auth', () => {
  const { authorization } = useAuthorization()
  return { auth: authorization }
})

// Tests:
test('GET returns text response', async () => {
  const res = await app.request('/hello')
  expect(res.status).toBe(200)
  expect(await res.text()).toBe('Hello World!')
})

test('GET returns JSON response', async () => {
  const res = await app.request('/json')
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ message: 'ok' })
})

test('Route params are resolved', async () => {
  const res = await app.request('/users/42')
  expect(await res.json()).toEqual({ id: '42' })
})

test('POST body is readable', async () => {
  const res = await app.request('/echo', {
    method: 'POST',
    body: JSON.stringify({ name: 'Alice' }),
    headers: { 'content-type': 'application/json' },
  })
  expect(await res.json()).toEqual({ name: 'Alice' })
})

test('HttpError maps to status code', async () => {
  const res = await app.request('/error')
  expect(res.status).toBe(403)
})

test('Response headers and cookies are captured', async () => {
  const res = await app.request('/headers')
  expect(res.headers.get('x-custom')).toBe('value')
  expect(res.headers.get('set-cookie')).toContain('session=abc')
})

test('404 for unmatched routes', async () => {
  const res = await app.request('/nope')
  expect(res.status).toBe(404)
})

test('content-length is set for regular bodies', async () => {
  const res = await app.request('/hello')
  expect(res.headers.get('content-length')).toBe(
    Buffer.byteLength('Hello World!').toString()
  )
})
```

### SSR context tests (header forwarding)

```typescript
test('forwards authorization header from calling context', async () => {
  app.get('/page', async () => {
    // SSR handler — makes in-process API call
    const res = await app.request('/auth')
    return res.json()
  })

  // Simulate a real request with auth header
  const res = await app.request('/page', {
    headers: { authorization: 'Bearer tok123' },
  })
  expect(await res.json()).toEqual({ auth: 'Bearer tok123' })
})

test('programmatic request headers override forwarded headers', async () => {
  app.get('/page2', async () => {
    const res = await app.request('/auth', {
      headers: { authorization: 'Bearer override' },
    })
    return res.json()
  })

  const res = await app.request('/page2', {
    headers: { authorization: 'Bearer original' },
  })
  expect(await res.json()).toEqual({ auth: 'Bearer override' })
})
```

### Test that `prepareTestHttpContext` still works

Ensure the existing test helper is unaffected by `HttpResponse` changes. The new `captureMode` constructor parameter defaults to `false`, so `prepareTestHttpContext` (which doesn't pass it) continues to work unchanged.

---

## Downstream: How Moost Wraps This

With `WooksHttp.fetch()` available, Moost's HTTP adapter (`MoostHttp`) exposes it as a thin passthrough:

```typescript
// In @moostjs/event-http
class MoostHttp {
  fetch(request: Request): Promise<Response> {
    return this.httpApp.fetch(request)
  }

  request(input: string | URL | Request, init?: RequestInit): Promise<Response> {
    return this.httpApp.request(input, init)
  }
}
```

This goes through the full Moost pipeline (DI scoping, interceptors, argument resolution, pipes, validation) because Moost's handlers are the functions registered with the Wooks router via `bindHandler()`.

Moost can then provide a helper for building universal SSR clients:

```typescript
// Auto-detects local paths and routes them in-process (Nitro pattern)
function createLocalFetch(httpAdapter: MoostHttp): typeof fetch {
  return (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (url.startsWith('/')) {
      return httpAdapter.request(url, init)
    }
    return globalThis.fetch(input, init!)
  }
}
```

---

## Summary of Changes (as implemented)

### event-core — Slot isolation foundation

| File | Change |
|------|--------|
| `packages/event-core/src/context.ts` | `_shouldTraverseParent()` protected hook, guards in `get()`, `has()`, `set()` |
| `packages/event-core/src/wook.ts` | `WookComposable<T>` interface, `_slot` exposed via `Object.assign` on `defineWook` return |
| `packages/event-core/src/index.ts` | Export `WookComposable` type |

### event-http — Programmatic fetch

| File | Change |
|------|--------|
| `packages/event-http/src/response/http-response.ts` | `_captureMode` constructor param, capture guard in `send()`, `toWebResponse()`, `_buildWebHeaders()`, `recordToWebHeaders()`, `json()`/`text()` overrides, `finalizeCookies()` idempotency |
| `packages/event-http/src/http-adapter.ts` | `fetch()`, `request()`, `createFakeIncomingMessage()`, `DEFAULT_FORWARD_HEADERS`, `forwardHeaders` option, ServerResponse write interception, cookie auto-propagation |
| `packages/event-http/src/ssr-fetch.spec.ts` | 50 tests: capture mode, integration, SSR forwarding, cookie propagation, response isolation, raw write capture, Moost compatibility |

### Future — Shared computation via context inheritance

The `_shouldTraverseParent` hook and `_slot` exposure are ready in event-core. The `HttpFetchContext` subclass and `{ context: 'inherit' }` fetch option are future work for sharing expensive computations (user profiles, roles) across multiple programmatic fetches within a single page request.

---

## Open Design Questions

### `isolate` vs alternative approaches

The `isolate` array approach requires enumerating all request-derived cached slots. This has trade-offs:

- **Pro:** Explicit, zero magic, composable-level control.
- **Con:** Brittle if new composables are added but not listed. Third-party composables that read from `req` won't be isolated unless the user adds them.

Alternatives under consideration:

1. **`isolateCached: boolean`** — Block ALL cached slot inheritance from parent. Simple but prevents sharing entirely. User-defined composables would need a separate "session store" mechanism.

2. **Event kind-scoped isolation** — Isolate all cached slots whose factory reads from a specific event kind's keys (auto-detected via dependency tracking). More magical but eliminates the manual slot list.

3. **Composable-level opt-in** — Composables declare themselves as `session`-scoped vs `request`-scoped. Session-scoped ones are shared, request-scoped ones always re-compute.

The right approach will become clearer as Tier 1 is used in production and the actual sharing patterns emerge.
