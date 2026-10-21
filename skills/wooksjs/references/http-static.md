# @wooksjs/http-static — Static File Serving

`serveFile(filePath, options?)` serves a file from inside a handler: sets status/headers on the current response and returns the body (stream or string). See [event-http.md](event-http.md) for app setup, [router.md](router.md) for wildcard routes.

## Quick start

```ts
import { serveFile } from '@wooksjs/http-static'
import { useRouteParams } from '@wooksjs/event-http'

app.get('/static/*', () => serveFile(useRouteParams<{ '*': string }>().get('*'), { baseDir: './public' }))
```

## Options

| Option          | Type                       | Effect                                                                    |
| --------------- | -------------------------- | ------------------------------------------------------------------------- |
| `baseDir`       | `string`                   | Base directory for resolving `filePath` (default: `process.cwd()`)        |
| `defaultExt`    | `string`                   | When the path has no extension and the file is missing, retry once with `.{defaultExt}` appended |
| `index`         | `string`                   | Index filename (e.g. `'index.html'`) served when the path is a directory  |
| `listDirectory` | `boolean`                  | Render an HTML directory listing for directory paths                      |
| `allowDotDot`   | `boolean`                  | Allow `../` traversal outside `baseDir` (default: forbidden → 403)        |
| `cacheControl`  | `TCacheControl`            | Cache-Control directives (same shape as `response.setCacheControl`)       |
| `expires`       | `Date \| string \| number` | Expires header                                                            |
| `pragmaNoCache` | `boolean`                  | Sets `Pragma: no-cache`                                                   |
| `headers`       | `Record<string, string>`   | Extra response headers, applied last (file responses only)                |

## Rules & invariants

1. **Path traversal → `HttpError 403` by default.** The resolved path must stay inside `baseDir` (or cwd). `allowDotDot: true` opts out — only use with trusted paths.
2. **Missing file → `HttpError 404`.** `defaultExt` retries exactly once, and only when the requested path has no extension.
3. **Conditional GET:** `ETag` + `Last-Modified` are set on `200`/`206`/listing responses AND on the `304` (with `cacheControl`/`expires`/`pragmaNoCache` from options). Same rules as every response (`checkPreconditions` from `@wooksjs/event-http`): weak `If-None-Match` (lists, `*`, takes precedence), else `If-Modified-Since` (GET/HEAD) as ONE strict HTTP-date not in the future, compared at whole seconds. Checked BEFORE `Range` (matching `If-None-Match` + `Range` → `304`, not `206`). Stale `If-Match` (strong) / `If-Unmodified-Since` → `412` (any method, checked first). Other methods (mounted via `app.all`) with a matching `If-None-Match` → `412`. `304` has no body and no representation headers.
4. **Byte ranges (GET only; HEAD/others ignore `Range`; unit case-insensitive):** `bytes=a-b`, `bytes=a-`, suffix `bytes=-n` → `206` + `Content-Range`. Start ≥ size, `-0`, or an empty file → `416` + `Content-Range: bytes */size`. Multi-range, other unit, bad syntax (`9-1`, `abc`) → ignored → full `200`. `If-Range` is STRONG: only the exact `ETag` (a `W/` tag never matches) or the exact `Last-Modified` date of a file NOT modified within the current second keeps the `206`; otherwise full `200` — even when the Range is invalid. `Accept-Ranges: bytes` is advertised.
5. **Directories:** `listDirectory` takes precedence over `index`. With `index`, a directory URL without a trailing slash → `302` redirect to `url + '/'`; with a trailing slash the index file is served. Neither option → `404`.
6. **`options.headers` apply last** (any casing, one line per name) — they can override the computed `content-type`, never `content-length`/`content-range`; skipped on 304 responses, 302 redirects, and directory listings. `412`/`416` are error responses: `Cache-Control: no-store` replaces the cache options (never cacheable).
7. `HEAD` requests get full headers (`content-length` etc.) with an empty body.
8. Content-Type is inferred from the file extension; fallback `application/octet-stream`.
9. The options type is not exported — pass an inline options literal.
10. All failures are `HttpError` — rendered by the framework like any other error ([http-response.md](http-response.md#httperror-and-error-rendering)).

## Key imports

```ts
import { serveFile } from '@wooksjs/http-static'
import { useRouteParams } from '@wooksjs/event-http' // wildcard path from the route
```

## See also

- Docs: https://wooks.moost.org/webapp/static.html
- Source: `packages/http-static/src/serve-file.ts`
- [router.md](router.md) — wildcard (`*`) route patterns
- [http-response.md](http-response.md) — cache control, headers, error rendering
