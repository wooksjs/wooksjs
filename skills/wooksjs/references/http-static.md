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
3. **Conditional GET:** `ETag` + `Last-Modified` are set on `200`/`206`/listing responses (not on `304` or error responses); matching `If-None-Match` (takes precedence) or a newer `If-Modified-Since` → `304` with empty body. Cache headers from options are not set on 304.
4. **Byte ranges:** a single `Range: bytes=start-end` → `206` + `Content-Range`; invalid/unsatisfiable range → `HttpError 416`. An `If-Range` mismatch (stale ETag/date) falls back to a full `200`. `Accept-Ranges: bytes` is advertised.
5. **Directories:** `listDirectory` takes precedence over `index`. With `index`, a directory URL without a trailing slash → `302` redirect to `url + '/'`; with a trailing slash the index file is served. Neither option → `404`.
6. **`options.headers` apply last** — they can override the computed `content-type`/`content-length`, but are skipped on 304 responses, 302 redirects, and directory listings.
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
