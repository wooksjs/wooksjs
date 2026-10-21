# @wooksjs/event-http — Response, Errors & Testing

See [event-http.md](event-http.md) for app setup/routing, [http-request.md](http-request.md) for request composables.

## Contents

- [`useResponse` / `HttpResponse`](#useresponsectx-httpresponse)
- [Status](#status), [Headers](#headers), [Cookies (outgoing)](#cookies-outgoing), [Cache Control](#cache-control)
- [Duration Units](#duration-units) — numbers are seconds
- [Conditional GET (304)](#conditional-get-304) — automatic for any `ETag` / `Last-Modified`; `vary()`
- [Pre-serialized JSON & ETag](#pre-serialized-json--etag) — `prerenderJson`, computed or custom ETag
- [Response Compression](#response-compression) — `compression` option, `setCompression`, `negotiateEncoding`
- [Body Content-Type Inference](#body-content-type-inference)
- [Raw Response Access](#raw-response-access) — `getRawRes()`, `responded`
- [HttpError and Error Rendering](#httperror-and-error-rendering) — `code`/`params`, `transformErrorBody`, content-negotiated body
- [Streaming and SSE](#streaming-and-sse)
- [Testing](#testing) — `prepareTestHttpContext`
- [Rules & Gotchas](#rules--gotchas)

## `useResponse(ctx?): HttpResponse`

Returns the `HttpResponse` for the current request. Methods are chainable.

```ts
const response = useResponse()
response.setStatus(200).setHeader('x-custom', 'value')
```

---

## Status

```ts
response.status = 201              // set via property
response.setStatus(201)            // set via method (chainable)
const code = response.status       // get current status
```

Two constants are exported from `@wooksjs/event-http` to avoid magic numbers (use with `setStatus`, `HttpError`, anywhere):

```ts
import { EHttpStatusCode, httpStatusCodes } from '@wooksjs/event-http'
EHttpStatusCode.Created   // 201 (numeric enum: OK, Created, NotFound, ...)
httpStatusCodes[404]      // 'Not Found' (code → description map)
```

If not set explicitly, status is inferred via [auto-status table](event-http.md#auto-status-inference).

---

## Headers

```ts
response.setHeader('x-custom', 'value')           // set (chainable)
response.setHeaders({ 'x-one': '1', 'x-two': '2' }) // batch-set
response.setHeader('x-multi', ['a', 'b'])          // multi-value
response.getHeader('x-custom')                     // get value
response.removeHeader('x-custom')                  // remove (chainable)
response.headers()                                 // all headers as Record
response.setContentType('application/xml')         // shorthand
response.getContentType()                          // get content-type
response.enableCors('*')                           // Access-Control-Allow-Origin (chainable)
```

---

## Cookies (Outgoing)

Set-Cookie headers managed via `HttpResponse`:

```ts
response.setCookie('session', 'abc123', {
  httpOnly: true,
  secure: true,
  sameSite: 'Strict',
  maxAge: 3600,           // seconds (also accepts time strings)
  path: '/',
  domain: '.example.com',
  expires: new Date('2025-12-31'),
})

response.getCookie('session')        // { value, attrs } or undefined
response.removeCookie('session')
response.clearCookies()
response.setCookieRaw('name=value; Path=/; HttpOnly')
response.getSetCookieStrings()       // render buffered cookies as Set-Cookie strings WITHOUT sending
```

`getSetCookieStrings()` — for callers that own the wire themselves (SSR render sites via [withHttpContext](event-http.md#withhttpcontextreq-res-fn--request-context-without-dispatch)): renders named + raw buffered cookies in order, non-destructive (repeat calls return the same list). Does NOT include `set-cookie` values placed via `setHeader()`. If you drain and apply cookies yourself, do not also `send()` through the wrapper — they'd be emitted again.

**`TCookieAttributes`:**

| Attribute  | Type                                     | Description        |
| ---------- | ---------------------------------------- | ------------------ |
| `expires`  | `Date \| string \| number`               | Expiration date (number = ms timestamp) |
| `maxAge`   | `number \| TTimeMultiString`             | Seconds (number) or duration string — see [Duration Units](#duration-units) |
| `domain`   | `string`                                 | Cookie domain      |
| `path`     | `string`                                 | Cookie path        |
| `secure`   | `boolean`                                | Secure flag        |
| `httpOnly` | `boolean`                                | HttpOnly flag      |
| `sameSite` | `boolean \| 'Lax' \| 'None' \| 'Strict'` | SameSite policy    |

---

## Cache Control

```ts
response.setCacheControl({
  public: true,
  maxAge: 3600,
  sMaxage: 7200,
  noStore: false,
  noCache: false,
  mustRevalidate: true,
})

response.setAge(300)                          // Age header (seconds)
response.setExpires(new Date('2025-12-31'))   // Expires header
response.setExpires('2025-12-31')             // also accepts strings
response.setPragmaNoCache()                   // Pragma: no-cache
```

### Duration Units

| # | Rule |
|---|---|
| 1 | Cookie `maxAge`, `setCacheControl({ maxAge, sMaxage })`, `setAge()`: **a number is seconds** (`86400` = 1 day). Never multiply by 1000. |
| 2 | A string carries units: `'90s'`, `'1h 30m'`, `'1.5h'` (`ms s m h d w M Y`). Unparseable (`'15x'`, `''`) or non-finite numbers throw `TypeError`. |
| 3 | Rendered as plain digits: whole seconds, rounded down, clamped to `0`–`2147483648` (never an exponent or sign). Cookie `maxAge <= 0` → `Max-Age=0` (expires the cookie). Bare digit strings (`'3600'`) throw — use a number or add a unit. |
| 4 | Timestamps are milliseconds: cookie `expires` number, `setExpires(number)`. |
| 5 | Before 0.7.32 a number was divided by 1000 (`maxAge: 86400` → `max-age=86.4`). Remove any `*1000` workaround when upgrading. |

---

## Conditional GET (304)

Automatic, no opt-in. `GET`/`HEAD` (304: final status `200`; 412: any 2xx):

| # | Rule |
|---|---|
| 1 | `If-None-Match` present → `304` iff the response's `ETag` (explicit header or `prerenderJson`) weakly matches an entry or `*`. `If-Modified-Since` then ignored. |
| 2 | Else `If-Modified-Since` → `304` iff response `Last-Modified` ≤ it (whole seconds). Counts only if it is ONE valid HTTP-date (IMF-fixdate / RFC 850 / asctime) not in the future — `Date.parse`-style values (`'2026'`, ISO) are ignored. |
| 3 | No validator → never `304`. Other methods/statuses (201, 206, errors) → never `304`. |
| 4 | `304` drops body and the representation headers (`Content-Type/-Length/-Encoding/-Language/-Range/-MD5`); keeps `Content-Location`, `Content-Security-Policy`, `ETag`, `Last-Modified`, `Cache-Control`, `Vary`, cookies. Streams destroyed unread; fetch `Response` bodies cancelled. Same on socket and `app.fetch()`. A handler-set `setStatus(304)` is sent the same way. |
| 4a | Full RFC 9110 §13.2.2 order: `If-Match` (STRONG; `*` = a current representation exists — any 2xx is one) else `If-Unmodified-Since` → stale = `412` for any GET/HEAD 2xx, rendered through the error path (standard error body via `transformErrorBody`, none for HEAD, `no-store`); then `If-None-Match` (`*` = exists), else `If-Modified-Since` → `304` (200 only). |
| 4b | HEAD headers = GET headers: same compression negotiation (`Content-Encoding`, `Vary`, weakened ETag; no `Content-Length` next to an encoding); an explicit `Content-Length` with NO HEAD body is kept (and counts as a body for the default status); a HEAD with a body is measured like GET. |
| 4c | Header names are case-insensitive and stored lower-case (`headers()` keys are lower-case): one line per name on the wire, every path. Content-Length = bytes sent: computed for values, the fetch Response's own for its body (a set one is dropped), yours for streams; none on 204; `''` body → no inferred Content-Type. |
| 4d | Weak ETags (`prerenderJson({ etag: true })`, any ETag on a compressed response) never satisfy `If-Match` → 412. Lost-update recipe: GET sends a strong `ETag` (`"${version}"`), PUT/PATCH/DELETE run `checkPreconditions(method, useHeaders(), { etag })` and throw `HttpError(verdict)` on 412. With compression ON the client receives `W/"…"` (weakened) → its `If-Match` always 412s: `setCompression(false)` on those GETs, or have the client send the strong tag from the body / a custom header. |
| 4e | A `304` carries exactly the validators of the `200` it confirms — with compression on, the weakened `W/` ETag for that `Accept-Encoding`. `If-*` detection scans `req.rawHeaders` first: an `If-*` header injected into `req.headers` by code in front of wooks (not in `rawHeaders`) is not seen; requests without `rawHeaders` (fetch, test contexts) use `req.headers`. |
| 5 | The handler still runs. To skip expensive work / refuse a stale write: `checkPreconditions(method, useHeaders(), { etag, lastModified, exists? })` → `304` (GET/HEAD) \| `412` (stale If-Match/IUS, or matching If-None-Match on a write) \| `undefined`. `exists` (for `*`) defaults to "has etag or lastModified"; pass `false` for a create. `parseHttpDate(v)` → epoch ms \| `undefined`. `serveFile` uses the same rules (+ strong `If-Range`). |

`response.vary(...headers)` merges into `Vary` (case-insensitive, deduped, leaves `*`). Compression adds `Accept-Encoding`, `useAcceptLanguage().negotiate()` adds `Accept-Language`.

---

## Pre-serialized JSON & ETag

`prerenderJson(obj, { etag? })` (from `@wooksjs/event-http`) serializes a long-lived response object once and keys the JSON by object identity; returning that same object later skips `JSON.stringify`. Returns `obj`.

```ts
import { prerenderJson, useResponse } from '@wooksjs/event-http'

const meta = prerenderJson(Object.freeze(buildMeta()), { etag: true })
app.get('/meta', () => {
  useResponse().setHeader('cache-control', 'private, no-cache')
  return meta
})
```

| # | Rule |
|---|---|
| 1 | **Never mutate a registered object** (or anything it references) — the stored JSON is never refreshed. Build a new object; deep-freeze registered objects in dev/tests to catch violations. |
| 2 | Hit only on the *same object identity*. A copy/spread (`{ ...meta }`) or an interceptor replacing the body is a plain miss — normal stringify, no ETag. |
| 3 | `{ etag: true }` → weak `ETag` (`W/"…"`, sha256 of the bytes); `{ etag: '"rev-7"' }` → your own tag (must be quoted, optional `W/`, else `TypeError`). Set on `GET`/`HEAD` 2xx responses carrying the object (other methods: no ETag). |
| 4 | `304` follows [Conditional GET](#conditional-get-304). |
| 5 | Errors and non-2xx never get an ETag or `304` (thrown `HttpError`, explicit `setStatus(404)`). |
| 6 | An `ETag` header set explicitly on the response wins — it is sent, and `If-None-Match` is judged against it. |
| 7 | Same behaviour on the socket path and `app.fetch()`. Calling `prerenderJson` again reuses the JSON (adds a computed ETag if newly requested; a string `etag` replaces the stored one); entries are weak (die with the object). |
| 8 | Per-viewer bodies: the ETag is computed from the final bytes, so different bodies never share an ETag — still send `Vary`/`Cache-Control: private` for shared caches. |

---

## Response Compression

Opt-in brotli/gzip for regular bodies, negotiated from `Accept-Encoding`. Off unless enabled.

```ts
import { createHttpApp, useResponse, isCompressibleType, negotiateEncoding } from '@wooksjs/event-http'

const app = createHttpApp({ compression: true })
// or: { threshold: 1024, encodings: ['br', 'gzip'], brotliQuality: 4, gzipLevel: 6, filter: (type, response) => isCompressibleType(type) }
// moost: new MoostHttp({ compression: true })

app.get('/me', () => {
  useResponse().setCompression(false) // per-response opt-out
  return { csrf, echo }
})
```

| # | Rule |
|---|---|
| 1 | Off by default. `compression: true` → defaults above; object overrides individual fields. |
| 2 | `useResponse().setCompression(false \| true \| opts)`: `false` disables for this response; `true`/`opts` enables even when the app has it off (opts layer over app settings). `response.compression` = effective settings or `false`. |
| 3 | Compressed only when ALL hold: regular body (string/number/boolean/object/`Uint8Array`) ≥ `threshold` UTF-8 bytes; status not 1xx/204/206/304; no `Content-Encoding` set; no `Cache-Control: no-transform`; `filter(contentType)` true (default: text/* except event-stream, json/+json, xml/+xml, js, svg, ndjson, wasm, urlencoded); client accepts `br`/`gzip`. HEAD negotiates the same way but sends no body (and no Content-Length next to the encoding). |
| 4 | Never compressed: `Readable` streams, SSE, fetch `Response` bodies, `app.fetch()`/`request()` (in-process, SSR local fetch), `withHttpContext`. |
| 5 | Negotiation: highest client q wins, `encodings` order breaks ties; `q=0` excludes; `*` covers unlisted codings; missing header / `identity` only → uncompressed. Exported as `negotiateEncoding(header, supported)`. |
| 6 | `Vary: Accept-Encoding` is merged into existing `Vary` on every eligible response — also for identity clients, HEAD and prerender `304`s. `Vary: *` left alone. |
| 7 | `Content-Length` = compressed size. A strong `ETag` you set is weakened (`W/"…"`) on compressed responses. |
| 8 | `prerenderJson` bodies are compressed once per coding+level (in-flight promise shared by concurrent requests), then served synchronously from memory. Prerender weak ETag shared across codings; `304` unchanged. |
| 9 | Error responses (`HttpError`, thrown errors) follow the same rules — large JSON/HTML errors are compressed. |
| 10 | Compression is async on the libuv threadpool (4 threads default, shared with fs/dns/crypto) — raise `UV_THREADPOOL_SIZE` on busy servers. Non-qualifying responses keep the synchronous path. Compressor error → logged, identity body sent. |
| 11 | BREACH: never compress a body that contains a secret (CSRF/API/session token) together with attacker-reflected input → `setCompression(false)` for those routes; careful with SSR HTML. |
| 12 | Don't stack with a proxy/`compression()` middleware — choose one layer. Keep `brotliQuality` 4–5 for dynamic bodies (11 is hundreds of times slower). |

---

## Body Content-Type Inference

| Return type                      | Content-Type          | Status         |
| -------------------------------- | --------------------- | -------------- |
| `string`                         | `text/plain`          | Auto           |
| `number` / `boolean`             | `text/plain`          | Auto           |
| `object` / `array`               | `application/json`    | Auto           |
| `Buffer` / `Uint8Array`          | (none -- set manually) | Auto          |
| `Readable` stream                | (none -- set manually) | Auto          |
| `Response` (fetch)               | From fetch response   | From fetch response |
| `undefined` / `null` / no return | --                    | 204 No Content |

Returning a fetch `Response` forwards its status, headers, and body:

1. Status from the `Response` is used unless already set via `useResponse()`.
2. ALL `Response` headers are forwarded; headers buffered via `useResponse()` win.
3. Multiple `set-cookie` values are preserved; cookies from `setCookie()` come first.
4. Identical merge policy on the socket path and programmatic `app.fetch()` — see [event-http.md](event-http.md#programmatic-invocation-fetch--request).

---

## Raw Response Access

For escape hatches (SSE, WebSocket upgrades, etc.):

```ts
// Full control -- framework will not send anything
const res = response.getRawRes()
res.writeHead(200, { 'content-type': 'text/event-stream' })
res.write('data: hello\n\n')

// Passthrough -- you write to res, framework still finalizes cookies and status
const res = response.getRawRes(true)
```

**`responded` property:** check `response.responded` before sending to avoid double-send errors.

---

## HttpError and Error Rendering

```ts
import { HttpError } from '@wooksjs/event-http'

throw new HttpError(404)                                      // default message
throw new HttpError(400, 'Invalid email')                     // custom message
throw new HttpError(422, { message: 'Too short', code: 'MIN_LENGTH', params: { min: 3 }, field: 'name' })
// body: { statusCode: 422, error: 'Unprocessable Entity', message, code, params, field } — extra fields are typed (inferred)
```

| # | Rule |
|---|---|
| 1 | Object body needs `message`; `code` (UPPER_SNAKE) and `params` are optional and pass through. Extra fields are inferred into `error.body`'s type. |
| 2 | `statusCode`, `message`, `error` (status text) always come from the error, never from the body object. |
| 3 | `createHttpApp({ transformErrorBody: (body, error, ctx) => body })` sees EVERY rendered error: thrown/returned `HttpError`, other errors (as 500), router 404. Use it to translate `message` from `code` + `params` (with `useLocale()`). Must return synchronously a plain object with numeric `statusCode` + string `message`; anything else (undefined, Promise, array…) or a throw → logged, original body sent. Status is ALWAYS the error's own. A throwing `renderError` falls back to plain JSON — a response always goes out. |
| 3a | Every error-path response (thrown/returned errors, router 404, automatic 412, serveFile 412/416) is NEVER storable: `Cache-Control`/`Expires` set before the failure are dropped, `Cache-Control: no-store` sent. A deliberately cacheable failure = `setStatus(4xx)` + body + your cache headers (untouched). |
| 4 | Keep `message` in the default language — it is the fallback for clients ignoring `code`. |

`HttpError` skips stack trace capture (performance optimization for expected control-flow errors).

**Error rendering (`WooksHttpResponse`):** renders based on request `Accept` header:

- `application/json` -> JSON `{ statusCode, message, error }`
- `text/html` -> styled HTML error page with SVG icons
- `text/plain` -> plain text error

Override by subclassing `WooksHttpResponse`:

```ts
import { WooksHttpResponse, type TWooksErrorBodyExt, type EventContext } from '@wooksjs/event-http'

class MyResponse extends WooksHttpResponse {
  protected renderError(data: TWooksErrorBodyExt, _ctx: EventContext): void {
    this._status = data.statusCode
    this._headers['content-type'] = 'application/json'
    this._body = JSON.stringify({ error: data.message })
  }
}

const app = createHttpApp({ responseClass: MyResponse })
```

---

## Streaming and SSE

### Streaming Response

```ts
import { createReadStream } from 'fs'

app.get('/file', () => {
  useResponse().setContentType('application/octet-stream')
  return createReadStream('/path/to/file')
})
```

Returned `Readable`s and fetch `Response` bodies are piped with backpressure (`stream.pipeline`):

| Event | Effect |
|---|---|
| client disconnects | source destroyed / fetch body cancelled — release producer resources (cursors, timers) in the stream's `destroy`/`close` |
| source errors mid-body | connection aborted, error logged — the client sees a failed read, never a truncated body that looks complete |

Before 0.7.25: a stream returned after the request body was read (`rawBody()`/`useBody()`) was never destroyed on disconnect and kept producing; a fetch body kept being drained; a source error ended the response normally.

### Server-Sent Events

```ts
app.get('/events', () => {
  const res = useResponse().getRawRes()
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  })

  const interval = setInterval(() => {
    res.write(`data: ${JSON.stringify({ time: Date.now() })}\n\n`)
  }, 1000)

  res.on('close', () => clearInterval(interval))
  return res // returning raw response signals "already handled"
})
```

---

## Testing

### `prepareTestHttpContext(options): (cb) => T`

Create a fully initialized HTTP event context for testing. Sets up `EventContext` with `httpKind` seeds (fake `IncomingMessage`, `HttpResponse`, route params, optional pre-seeded body).

```ts
import { prepareTestHttpContext } from '@wooksjs/event-http'
```

**Options (`TTestHttpContext`):**

| Option           | Type                                 | Required | Description                                  |
| ---------------- | ------------------------------------ | -------- | -------------------------------------------- |
| `url`            | `string`                             | Yes      | Request URL (e.g. `/api/users?page=1`)       |
| `method`         | `string`                             | No       | HTTP method (default: `'GET'`)               |
| `headers`        | `Record<string, string>`             | No       | Request headers                              |
| `params`         | `Record<string, string \| string[]>` | No       | Pre-set route parameters                     |
| `requestLimits`  | `TRequestLimits`                     | No       | Custom request limits                        |
| `rawBody`        | `string \| Buffer`                   | No       | Pre-seed raw body (skips stream reading)     |
| `defaultHeaders` | `Record<string, string \| string[]>` | No       | Default headers to pre-populate on response  |

**Returns:** `(cb: () => T) => T` -- a runner that executes the callback inside the context scope.

### Testing a Custom Composable

```ts
import { describe, it, expect } from 'vitest'
import { prepareTestHttpContext, useHeaders } from '@wooksjs/event-http'
import { defineWook } from '@wooksjs/event-core'

const useApiKey = defineWook((ctx) => {
  const headers = useHeaders(ctx)
  return {
    apiKey: headers['x-api-key'] as string | undefined,
    isValid: () => headers['x-api-key'] === 'secret',
  }
})

describe('useApiKey', () => {
  it('extracts API key from headers', () => {
    const run = prepareTestHttpContext({
      url: '/api/data',
      headers: { 'x-api-key': 'secret' },
    })
    run(() => {
      const { apiKey, isValid } = useApiKey()
      expect(apiKey).toBe('secret')
      expect(isValid()).toBe(true)
    })
  })
})
```

### Testing Body Parsing

```ts
import { useBody } from '@wooksjs/http-body'

it('parses JSON body', async () => {
  const run = prepareTestHttpContext({
    url: '/api/users',
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    rawBody: JSON.stringify({ name: 'Alice' }),
  })
  await run(async () => {
    const { parseBody } = useBody()
    const body = await parseBody<{ name: string }>()
    expect(body.name).toBe('Alice')
  })
})
```

### Testing Response

```ts
it('sets response headers and cookies', () => {
  const run = prepareTestHttpContext({ url: '/test' })
  run(() => {
    const response = useResponse()
    response.setHeader('x-custom', 'value')
    response.setCookie('session', 'abc', { httpOnly: true })
    expect(response.getHeader('x-custom')).toBe('value')
    expect(response.getCookie('session')?.value).toBe('abc')
  })
})
```

### Testing Cookies

```ts
it('reads cookies from request', () => {
  const run = prepareTestHttpContext({
    url: '/dashboard',
    headers: { cookie: 'session=abc123; theme=dark' },
  })
  run(() => {
    const { getCookie } = useCookies()
    expect(getCookie('session')).toBe('abc123')
    expect(getCookie('theme')).toBe('dark')
    expect(getCookie('missing')).toBeNull()
  })
})
```

---

## Rules & Gotchas

- Use `useResponse()` only when explicit control over headers/cookies/status is needed.
- Use `HttpError` for error responses; do not manually set error status/body.
- Calling `send()` twice throws — check `response.responded`.
- `getRawRes()` (no arg) marks response "responded"; framework will not touch it.
- `getRawRes(true)` passthrough: you write headers/data, framework still finalizes cookies and status.
- Cookie `maxAge`, cache `maxAge`/`sMaxage`, `setAge()`: numbers are seconds — see [Duration Units](#duration-units).
- Default status: POST with body → 201; any other method with body → 200; no body → 204. Exported as `DEFAULT_HTTP_STATUS` / `getDefaultHttpStatus(method, hasBody)`.
- `setContentType()` overwrites any prior content-type.
- For custom error rendering, subclass `WooksHttpResponse` and override `renderError()`.
- `prerenderJson` objects must never be mutated after registration — see [Pre-serialized JSON & ETag](#pre-serialized-json--etag).
- Response compression is opt-in; opt a response out with `setCompression(false)` when it mixes secrets with reflected input — see [Response Compression](#response-compression).

Testing:
- Always use `prepareTestHttpContext`; do not manually construct `EventContext`.
- Pre-seed `rawBody` for body tests; pre-seed `params` for route-param tests.
- Runner supports async: `await run(async () => { ... })`.
- Test uses base `HttpResponse`, not `WooksHttpResponse` — no content-negotiated error rendering in tests.
- `prepareTestHttpContext` uses real `IncomingMessage`/`ServerResponse` on a fake `Socket` (functional, not networked).
