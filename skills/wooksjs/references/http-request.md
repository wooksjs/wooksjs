# @wooksjs/event-http — Request Composables

## Table of Contents

1. [useRequest](#userequestctx)
2. [useHeaders](#useheadersctx)
3. [useCookies](#usecookiesctx)
4. [useUrlParams](#useurlparamsctx)
5. [useAuthorization](#useauthorizationctx)
6. [useAccept](#useacceptctx)
7. [Best Practices](#best-practices)
8. [Gotchas](#gotchas)

All composables accept an optional `ctx` parameter to skip the ALS lookup.

For app setup and routing, see [event-http.md](event-http.md).
For response API and testing, see [http-response.md](http-response.md).

---

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

**Per-request limit overrides:**

```ts
const { setMaxCompressed, setMaxInflated, setMaxRatio, setReadTimeoutMs } = useRequest()
setMaxCompressed(5 * 1024 * 1024) // 5 MB
setReadTimeoutMs(30_000)          // 30 seconds
```

Default limits: `maxCompressed: 1MB`, `maxInflated: 10MB`, `maxRatio: 100`, `readTimeoutMs: 10s`.

Limit setters use copy-on-write; they do not affect other requests.

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

Access URL query parameters.

```ts
const { params, toJson, raw } = useUrlParams()

const page = params().get('page')         // URLSearchParams API
const tags = params().getAll('tag')
const query = toJson()                     // { page: '1', tag: ['a', 'b'] }
const rawQuery = raw()                     // '?page=1&tag=a&tag=b'
```

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

## Best Practices

- Use `getCookie(name)` over parsing all cookies when you need only a few.
- `rawBody()` handles decompression (gzip, deflate, brotli) automatically with limits enforcement.
- Composables are lazy; call them only when you need the data.
- Pass `ctx` explicitly in hot paths with multiple composable calls to reduce ALS lookups.

---

## Gotchas

- `rawBody()` returns `Promise<Buffer>`. Always `await` it.
- `rawBody()` consumes the stream. It is cached; the second call returns the same buffer.
- `getCookie()` returns `null` (not `undefined`) when a cookie does not exist.
- `useRequest()` limit setters use copy-on-write. They do not affect other requests.
