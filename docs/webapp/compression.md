# Response Compression

Wooks HTTP can compress response bodies with brotli or gzip, picking the coding from the request's `Accept-Encoding` header. It is **off by default** — turn it on with the `compression` option of `createHttpApp`:

```ts
import { createHttpApp } from '@wooksjs/event-http'

const app = createHttpApp({ compression: true })

app.get('/tasks', () => loadTasks()) // a 300 KB JSON list goes out as ~25 KB of brotli
```

A response is compressed only when it is worth it and safe: a regular body (string, number, boolean, object, `Uint8Array`) of at least 1 KB with a compressible `Content-Type`. Everything else is sent exactly as before.

## Content

[[toc]]

## Options

`compression: true` uses the defaults below. Pass an object to change any of them:

```ts
const app = createHttpApp({
  compression: {
    threshold: 2048,      // bytes
    encodings: ['gzip'],  // never use brotli
    gzipLevel: 5,
  },
})
```

| Option | Default | Effect |
|--------|---------|--------|
| `threshold` | `1024` | Minimum body size in bytes (UTF-8). Smaller bodies are sent uncompressed. |
| `encodings` | `['br', 'gzip']` | Codings the server may use. The client's q-values decide; this order breaks ties. |
| `brotliQuality` | `4` | Brotli quality, `0`–`11`. |
| `gzipLevel` | `6` | Gzip level, `1`–`9`. |
| `filter` | `isCompressibleType` | `(contentType, response) => boolean` — decides which content types are compressed. Replaces the default check. |

The default filter accepts `text/*` (except `text/event-stream`), JSON and `*+json`, XML and `*+xml`, JavaScript, `image/svg+xml`, NDJSON, WASM and form-urlencoded. To extend it rather than replace it, call the exported `isCompressibleType` from your filter:

```ts
import { createHttpApp, isCompressibleType } from '@wooksjs/event-http'

const app = createHttpApp({
  compression: {
    filter: (type) => isCompressibleType(type) || type.startsWith('application/x-my-format'),
  },
})
```

With `@moostjs/event-http`, pass the same option to the adapter: `new MoostHttp({ compression: true })`.

## Per-response control

`useResponse().setCompression()` overrides the app setting for one response:

```ts
import { useResponse, useUrlParams } from '@wooksjs/event-http'

app.get('/session', () => {
  useResponse().setCompression(false) // carries a token next to reflected input — never compress
  return { token, echo: useUrlParams().params().q }
})

app.get('/report', () => {
  useResponse().setCompression({ brotliQuality: 6 }) // compress harder, even if the app has compression off
  return buildReport()
})
```

| Value | Effect |
|-------|--------|
| `false` | Never compress this response. |
| `true` | Compress with the app settings — or the defaults when the app has compression off. |
| options object | Compress with these settings layered over the app settings (or the defaults). |

`useResponse().compression` returns the effective settings, or `false` when compression is off for this response.

A `Cache-Control: no-transform` header also opts a response out (`setCacheControl({ noTransform: true })`).

## What gets compressed

| Response | Compressed? |
|----------|-------------|
| Regular body ≥ `threshold` with a compressible type, client accepts `br` or `gzip` | Yes — `Content-Encoding` set, `Content-Length` is the compressed size |
| Error responses (`HttpError`, thrown errors) | Yes, under the same rules — a large JSON or HTML error page is compressed |
| Body below `threshold`, non-compressible type (`image/png`, `application/octet-stream`, …) | No |
| `text/event-stream` | No |
| `Content-Encoding` already set by the handler | No — never re-encoded |
| `Cache-Control: no-transform` | No |
| `HEAD` | No — headers describe the uncompressed body (`Content-Length` of the identity body) |
| `204`, `206`, `304`, `1xx` | No |
| `Readable` stream or fetch `Response` body | No — sent as is |
| [Programmatic `app.fetch()`](./fetch.md) / SSR local fetch | No — the caller is in-process |
| No `Accept-Encoding`, `identity` only, or every supported coding at `q=0` | No |

### Accept-Encoding negotiation

The coding with the highest client q-value wins; the `encodings` order breaks ties. `q=0` excludes a coding, `*` stands for every coding the client did not list.

| `Accept-Encoding` | Result (default `encodings`) |
|-------------------|------------------------------|
| `gzip, deflate, br` | `br` |
| `br;q=0.5, gzip` | `gzip` |
| `*` | `br` |
| `*;q=0, gzip` | `gzip` |
| `identity` / `deflate` / missing | uncompressed |

The same logic is exported as `negotiateEncoding(acceptEncoding, supported)` for code that serves bodies outside the response pipeline (e.g. a custom SSR handler).

### Headers

- **`Vary: Accept-Encoding`** is added to every response that qualifies for compression — also when this particular client got the uncompressed body, and on a `304`. It is merged into an existing `Vary` (`Vary: Origin` becomes `Origin, Accept-Encoding`); `Vary: *` is left alone.
- **`Content-Length`** is the size of the bytes on the wire.
- **`ETag`**: a strong `ETag` you set yourself is weakened (`"v1"` → `W/"v1"`) on compressed responses, because the encoded bytes differ from the identity body. Weak ETags are kept as they are.

## Pre-serialized JSON

Bodies registered with [`prerenderJson()`](./composables/response.md#pre-serialized-json-etag) are compressed **once per coding** and the compressed bytes are kept with the registration. Later responses — including concurrent ones that arrive while the first compression is still running — reuse those bytes, so a cached envelope costs about the same compressed or not.

The weak `ETag` from `prerenderJson(obj, { etag: true })` is shared by the brotli, gzip and identity variants (valid for weak validators), and the `304` path is unchanged. Each coding adds roughly 10 % of the JSON size to the registration's memory.

## Security: BREACH

Compression leaks information through the response size. If a response body contains a **secret** (CSRF token, API key, session token) **and** text an attacker can influence (a reflected query parameter, a search term), an attacker who can make the victim's browser send many requests can recover the secret byte by byte from the compressed lengths (the BREACH attack).

- Turn compression off for such responses with `setCompression(false)`, or keep secrets and reflected input in separate responses.
- Be careful with server-rendered HTML that embeds a CSRF token or session state next to user input.
- Plain data responses (lists, records, metadata) without secrets are not affected.

## Performance

- Compression runs on Node's libuv threadpool (`zlib` async API) and never blocks the event loop. The threadpool has 4 threads by default and is shared with `fs`, `dns.lookup` and `crypto`; on busy servers with compression enabled consider raising `UV_THREADPOOL_SIZE`.
- Responses that do not qualify (small bodies, excluded types, compression off) take the same synchronous path as without compression.
- Rough costs for a 300 KB JSON body on one core: brotli-4 ≈ 3–4 ms (→ ~24 KB), gzip-6 ≈ 3 ms (→ ~22 KB); a `prerenderJson` body is compressed once and then served from memory. Keep `brotliQuality` at 4–5 for dynamic responses — quality 11 is hundreds of times slower and only suitable for build-time precompression.
- A compression failure is logged and the body is sent uncompressed.

## Do / Don't

**Do:**
- Enable compression for APIs that return large JSON or text (lists, reports, schemas).
- Use `prerenderJson` for large bodies that many requests share — they are compressed only once.
- Opt out with `setCompression(false)` for responses that mix secrets with reflected input.

**Don't:**
- Enable compression here *and* in a reverse proxy or an Express/connect `compression()` middleware — pick one layer.
- Set `Content-Encoding` yourself unless the body really is encoded — it disables compression for that response and is sent as is.
- Expect streams, SSE or fetch `Response` bodies to be compressed — compress them yourself or at the proxy.

## API

```ts
createHttpApp({ compression?: boolean | THttpCompressionOptions })

interface THttpCompressionOptions {
  threshold?: number                       // default 1024
  encodings?: Array<'br' | 'gzip'>         // default ['br', 'gzip']
  brotliQuality?: number                   // default 4
  gzipLevel?: number                       // default 6
  filter?: (contentType: string, response: HttpResponse) => boolean // default isCompressibleType
}
```

| Export | Description |
|--------|-------------|
| `HttpResponse.setCompression(value: boolean \| THttpCompressionOptions): this` | Per-response override (see [Per-response control](#per-response-control)). |
| `HttpResponse.compression: TResolvedHttpCompression \| false` | Effective settings for this response (all options filled in), or `false`. |
| `negotiateEncoding(acceptEncoding, supported): string \| undefined` | Picks a coding from an `Accept-Encoding` header value; `undefined` = send uncompressed. |
| `isCompressibleType(contentType): boolean` | The default `filter`. |
| `THttpCompressionEncoding` | `'br' \| 'gzip'`. |
