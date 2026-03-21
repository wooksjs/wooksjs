# Bug: `getServerCb(onNoMatch)` and `fetch()` null-return never trigger when `onNotFound` is set

## Problem

In v0.7.6, two features were added for middleware/SSR integration:

1. `getServerCb(onNoMatch)` — callback when no route matches
2. `fetch()` returns `null` when no route matches

Neither works when the `onNotFound` option is set on the WooksHttp instance, because the dispatch logic treats `onNotFound` as a valid handler:

```javascript
// getServerCb (line ~590 in dist)
const handlers = this.wooks.lookupHandlers(method, url, ctx)
if (handlers || notFoundHandler) {
  this.processHandlers(handlers || [notFoundHandler], ctx, response)
} else if (onNoMatch) {
  onNoMatch(req, res)   // ← never reached when notFoundHandler exists
}

// fetch (line ~530 in dist)
const handlers = this.wooks.lookupHandlers(method, pathname, ctx)
if (handlers || notFoundHandler) {
  this.processHandlers(handlers || [notFoundHandler], ctx, response)
  // always produces a Response
} else return null          // ← never reached when notFoundHandler exists
```

Since `handlers || notFoundHandler` is always truthy when `onNotFound` is configured, the `onNoMatch` callback never fires and `fetch()` never returns `null`.

## Why this matters

**Moost always sets `onNotFound`.** The `MoostHttp` constructor unconditionally registers an `onNotFound` handler that runs global interceptors for 404 responses:

```typescript
// MoostHttp constructor
this.httpApp = createHttpApp({
  onNotFound: this.onNotFound.bind(this),
})
```

This means any Moost user cannot use `onNoMatch` or rely on `fetch()` returning `null`.

## Concrete use case

The `@moostjs/vite` plugin needs to run Moost as Connect middleware alongside Vite's frontend (Vue/React). When a request doesn't match any Moost route, it should fall through to Vite's default handler (static assets, HMR, Vue pages).

**With `getServerCb(onNoMatch)`:**
```typescript
const handler = httpApp.getServerCb((req, res) => {
  // No Moost route matched → let Vite handle it
  next()
})
```

**With `fetch()` null-return (in `enableLocalFetch`):**
```typescript
const response = await http.fetch(request)
if (response) return response    // Moost handled it
return originalFetch(input, init) // Fall back to real fetch
```

Neither works today because `onNotFound` absorbs all unmatched requests.

## Proposed fix

`onNoMatch` (from `getServerCb` param) should take priority over `onNotFound` (from constructor options). The intent is different:

- `onNotFound` — "handle 404s with this handler" (app-level default)
- `onNoMatch` — "this route isn't mine, let someone else try" (middleware integration)

### For `getServerCb`:

```javascript
const handlers = this.wooks.lookupHandlers(method, url, ctx)
if (handlers) {
  this.processHandlers(handlers, ctx, response)
} else if (onNoMatch) {
  onNoMatch(req, res)
} else if (notFoundHandler) {
  this.processHandlers([notFoundHandler], ctx, response)
} else {
  this.respond(new HttpError(404), response, ctx)
}
```

### For `fetch`:

```javascript
const handlers = this.wooks.lookupHandlers(method, pathname, ctx)
if (handlers) {
  this.processHandlers(handlers, ctx, response)
} else {
  return null
}
```

`fetch()` should always return `null` on no match — the `onNotFound` handler is an app-level concern that doesn't apply to programmatic invocation. The caller decides what to do with unmatched requests.

## Affected versions

- v0.7.6 (`getServerCb(onNoMatch)` added but ineffective with `onNotFound`)
- `fetch()` null-return also affected
