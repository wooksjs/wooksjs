# @wooksjs/event-http — Request Composables

All composables accept an optional `ctx` parameter to skip the ALS lookup. See [event-http.md](event-http.md) for app setup/routing, [http-response.md](http-response.md) for response/errors/testing.

## Contents

- [`useRequest`](#userequestctx) — method/url/headers/body/IP/limits
- [`useHeaders`](#useheadersctx) — `IncomingHttpHeaders` shortcut
- [`useCookies`](#usecookiesctx) — `getCookie(name)` (returns `null` if missing)
- [`useUrlParams`](#useurlparamsctx) — query params
- [`useAuthorization`](#useauthorizationctx) — Basic/Bearer parsing
- [`useAccept`](#useacceptctx) — Accept header matching
- [`useAcceptLanguage`](#useacceptlanguagectx) — `negotiate(available, fallback)` + `Vary`
- [Proxy trust](#proxy-trust) — `trustProxy`, `getIp()`/`protocol()`/`host()`, `resolveForwarded`
- [Rules & Gotchas](#rules--gotchas)

## `useRequest(ctx?)`

Primary request composable.

```ts
import { useRequest } from '@wooksjs/event-http'
const { method, url, headers, rawBody, getIp, protocol, host, reqId } = useRequest()
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
| `getIp()`        | `() => string`                                    | Client IP via the app's `trustProxy` ([Proxy trust](#proxy-trust)) |
| `protocol()`     | `() => 'http' \| 'https'`                         | Client's protocol via `trustProxy`               |
| `host()`         | `() => string`                                    | Requested host (with port) via `trustProxy`      |
| `getIpList()`    | `() => { remoteIp: string; forwarded: string[] }` | RAW socket + X-Forwarded-For entries (forgeable) |
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

## `useAcceptLanguage(ctx?)`

```ts
import { useAcceptLanguage, useLocale } from '@wooksjs/event-http'
const lang = useAcceptLanguage().negotiate(['en', 'de', 'pt-BR'], 'en') // tag as spelled in `available`
```

| # | Rule |
|---|---|
| 1 | Ranges tried by `q` desc, then header order; `q=0` = not acceptable (also excluded from `*`) — and it excludes EVERY tag it covers (`en;q=0, en-US` excludes `en-US`). Malformed entries skipped. Algorithm: RFC 4647 lookup (truncation) + basic filtering (prefix). |
| 2 | Per range: exact tag (case-insensitive) → first available tag it covers (`en` → `en-US`) → truncations (`de-CH` → `de`). `*` = first non-excluded available. |
| 3 | No match → `fallback` (else `undefined`). |
| 4 | **Every `negotiate()` call adds `Vary: Accept-Language`.** `languages()` (ranked list) and `acceptLanguage` (raw) add nothing. |
| 5 | Header only. Query/cookie/user preference = app policy → put the whole policy in `createHttpApp({ resolveLocale })`, read it anywhere with `useLocale().get()` (event-core, see [event-core.md](event-core.md)). Wooks never translates. |

---

## Proxy trust

App-level, off by default. One resolver drives `getIp()`, `protocol()`, `host()`.

```ts
createHttpApp({ trustProxy: 1 })                          // one reverse proxy
createHttpApp({ trustProxy: ['10.0.0.0/8', 'loopback'] }) // by address (IPs, CIDRs, 'loopback'|'linklocal'|'uniquelocal')
createHttpApp({ trustProxy: (addr, hop) => hop === 0 })   // predicate; hop 0 = socket peer
createHttpApp({ trustProxy: 1, proxyHeaders: 'forwarded' }) // RFC 7239 instead of X-Forwarded-*
```

| # | Rule |
|---|---|
| 1 | Default `false`: forwarding headers ignored; IP = socket peer, protocol = socket TLS, host = `Host`. |
| 2 | Client = right-most hop that is NOT trusted, walking from the socket (hop 0) through `X-Forwarded-For` / `Forwarded: for=` right-to-left. Client-written entries are never reached. An entry a trusted hop wrote that is missing/empty/malformed/not an address (or a `Forwarded` element without `for=`) → client UNKNOWN `''` — never the proxy's own address. `Forwarded` is split from the right + strict RFC 7239 grammar, so a client's unterminated quote can't move the proxies' element boundaries. |
| 3 | `trustProxy: true` throws at startup (would let clients pick their IP) — use the hop count. Invalid IP/CIDR (prefix must be plain digits in range) also throws. Empty list = trust nothing. |
| 3a | Addresses are normalised: IPv4-mapped IPv6, dotted or hex (`::ffff:10.0.0.5`, `::ffff:a00:5`) → `10.0.0.5` for matching, predicates and `getIp()`. A throwing predicate fails closed (client `''`, logged once). |
| 3c | No forwarding header at all (or only empty elements) from a trusted peer → the PEER is the client (direct internal call). A present but malformed entry → `''`. `Forwarded` structure is strict; `for=` may also be an unquoted IP / IP:port or a bare IPv6 (`for=2001:db8::1`, `for="2001:db8::1"`). A malformed entry from hop 0 (your own proxy) is warned once. |
| 3d | A proxy copying the raw client `Host` into `Forwarded: host="…"` must escape it (or omit `host`) — else the client can inject an element. |
| 3b | `host()` validated with the same rule with or without trust (malformed → `''`). It is client-chosen: allowlist before building absolute URLs. |
| 4 | Only ONE header family is read (`proxyHeaders`, default `'x-forwarded'`). |
| 5 | `'x-forwarded'`: `X-Forwarded-Proto`/`-Host` = right-most entry, only if hop 0 is trusted (edge sets, inner proxies pass through). `'forwarded'`: per-element walk, outermost trusted `proto=`/`host=` wins. Invalid proto/host ignored. |
| 6 | `getIp({ trustProxy: true })` is DEPRECATED: now trusts exactly ONE hop (right-most XFF) of a KNOWN peer, not the left-most; unknown peer → `''`. `getIp({ trustProxy: false })` = socket. Logs a warning once. |
| 7 | `app.fetch()`/`request()` inside a request inherit the caller's resolved ip/protocol/host (and locale). With NO caller the peer is unknown: list/predicate trust read no forwarding headers, `getIp()` = `''`, protocol/host from the Request URL; pass `app.fetch(req, { remoteAddress, encrypted })` on Bun/Deno/edge. A hop count still trusts whatever sits in front. |
| 8 | Outside a request: `resolveForwarded(req, compileTrustProxy(opt), proxyHeaders, onIssue?)` → `{ ip, protocol, host }`; `onIssue` gets `{ kind: 'trust-error' }` / `{ kind: 'malformed', hop: 0 }` (`TForwardedIssue`). |
| 9 | `getIpList()` is raw and forgeable — never use it for decisions. |

---

## Rules & Gotchas

- `rawBody()` returns `Promise<Buffer>` — `await` it. Consumed+cached: second call returns same buffer.
- `rawBody()` decompresses gzip/deflate/brotli automatically; limits enforced.
- A child `EventContext` reads the PARENT's body through `rawBody()` unless seeded: `seedRawBody(childCtx, bytes)` (`@wooksjs/event-http`), or `seedBody()` from `@wooksjs/http-body` for a parsed value ([http-body.md](http-body.md)).
- `getCookie(name)` returns `null` (not `undefined`) for missing. Use it instead of parsing all cookies when you need a few.
- `useRequest()` limit setters are copy-on-write — do not affect other requests.
