# @wooksjs/event-http — Request Composables

All composables accept an optional `ctx` parameter to skip the ALS lookup. See [event-http.md](event-http.md) for app setup/routing, [http-response.md](http-response.md) for response/errors/testing.

## Contents

- [`useRequest`](#userequestctx) — method/url/headers/body/IP/limits
- [`useHeaders`](#useheadersctx) — `IncomingHttpHeaders` shortcut
- [`useCookies`](#usecookiesctx) — `getCookie(name)` (returns `null` if missing)
- [`useUrlParams`](#useurlparamsctx) — query params
- [`useAuthorization`](#useauthorizationctx) — Basic/Bearer parsing
- [`useAccept`](#useacceptctx) — Accept header matching
- [Rules & Gotchas](#rules--gotchas)

## `useRequest(ctx?)`

Primary request composable.

```ts
import { useRequest } from '@wooksjs/event-http'
const { method, url, headers, rawBody, getIp, reqId } = useRequest()
```

**Returned properties:**

| Property         | Type                                              | Description                                      |
| ---------------- | ------------------------------------------------- | ------------------------------------------------ |
| `raw`            | `IncomingMessage`                                 | Node.js raw request object                       |
| `url`            | `string`                                          | Request URL                                      |
| `method`         | `string`                                          | HTTP method                                      |
| `headers`        | `IncomingHttpHeaders`                             | Request headers                                  |
| `rawBody`        | `() => Promise<Buffer>`                           | Lazy: reads and decompresses request body        |
| `reqId`          | `() => string`                                    | Lazy UUID per request                            |
| `getIp(opts?)`   | `(opts?: { trustProxy: boolean }) => string`      | Client IP (optional proxy trust)                 |
| `getIpList()`    | `() => { remoteIp: string; forwarded: string[] }` | All IPs (remote + X-Forwarded-For)               |
| `isCompressed()` | `() => boolean`                                   | Whether the request body is compressed           |

For parsed bodies (JSON / form-data / urlencoded) use `useBody()` from `@wooksjs/http-body` — see [http-body.md](http-body.md).

**Per-request limit overrides:**

```ts
const { setMaxCompressed, setMaxInflated, setMaxRatio, setReadTimeoutMs } = useRequest()
setMaxCompressed(5 * 1024 * 1024) // 5 MB
setReadTimeoutMs(30_000)          // 30 seconds
```

Default limits: `maxCompressed: 1MB`, `maxInflated: 10MB`, `maxRatio: 100`, `readTimeoutMs: 10s`.

Matching getters read the current (possibly overridden) values: `getMaxCompressed()`, `getMaxInflated()`, `getMaxRatio()`, `getReadTimeoutMs()`.

Limit setters use copy-on-write; they do not affect other requests.

Exceeding limits throws `HttpError` automatically rendered to the client: `413` (compressed/inflated size or compression ratio), `415` (unknown Content-Encoding — supported: gzip/deflate/br, plus identity), `408` (read timeout). `setReadTimeoutMs(0)` disables the timeout.

---

## `useHeaders(ctx?): IncomingHttpHeaders`

Returns request headers directly. Shorthand for `useRequest().headers`.

```ts
const { host, authorization, 'content-type': contentType } = useHeaders()
```

---

## `useCookies(ctx?)`

Parses incoming request cookies lazily (per cookie name, via `cachedBy`).

```ts
const { getCookie, raw } = useCookies()
const session = getCookie('session_id') // parsed + cached
// raw = raw Cookie header string
```

`getCookie()` returns `null` (not `undefined`) when a cookie does not exist.

---

## `useUrlParams(ctx?)`

Access URL query parameters. `params()` returns a `WooksURLSearchParams` — `URLSearchParams` plus a typed `toJson<T>()`.

```ts
const { params, toJson, raw } = useUrlParams()

const page = params().get('page')         // standard URLSearchParams API
const tags = params().getAll('tags')      // raw repeated values
const query = toJson<{ page: string }>()  // safe plain object (rules below)
const rawQuery = raw()                     // '?page=1&tags[]=a&tags[]=b'
```

`toJson()` invariants:
1. Arrays use a trailing `[]` and the suffix is **kept** in the key: `?tags[]=a&tags[]=b` → `{ 'tags[]': ['a', 'b'] }`.
2. A repeated **non-`[]`** key throws `HttpError(400)` (`Duplicate key`). Use `[]`, or read repeats with `params().getAll('k')`.
3. Keys `__proto__` / `constructor` / `prototype` throw `HttpError(400)`; the result is a null-prototype object.

---

## `useAuthorization(ctx?)`

Parse the Authorization header (Basic, Bearer, any custom scheme).

```ts
const { authorization, type, credentials, is, basicCredentials } = useAuthorization()
```

**Returned properties:**

| Property             | Type                             | Description                                                    |
| -------------------- | -------------------------------- | -------------------------------------------------------------- |
| `authorization`      | `string \| undefined`            | Raw Authorization header value                                 |
| `type()`             | `string \| null`                 | Auth scheme: `'Basic'`, `'Bearer'`, etc.                       |
| `credentials()`      | `string \| null`                 | Everything after the scheme                                    |
| `is(type)`           | `boolean`                        | Check auth scheme: `'basic'`, `'bearer'`, or any custom scheme |
| `basicCredentials()` | `{ username, password } \| null` | Decoded Basic credentials                                      |

---

## `useAccept(ctx?)`

Check the request's `Accept` header for MIME type support. Accepts short names (`'json'`, `'html'`, `'xml'`, `'text'`) or full MIME types.

```ts
const { accept, has } = useAccept()
if (has('json')) { /* ... */ }
if (has('image/png')) { /* ... */ }
```

---

## Rules & Gotchas

- `rawBody()` returns `Promise<Buffer>` — `await` it. Consumed+cached: second call returns same buffer.
- `rawBody()` decompresses gzip/deflate/brotli automatically; limits enforced.
- `getCookie(name)` returns `null` (not `undefined`) for missing. Use it instead of parsing all cookies when you need a few.
- `useRequest()` limit setters are copy-on-write — do not affect other requests.
