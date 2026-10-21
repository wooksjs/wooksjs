# Serve Static

The `@wooksjs/http-static` package provides the serveFile function,
which allows you to serve static files in Wooks HTTP.
It returns a readable stream from the file system.

Features:

-   Returns a readable stream
-   Prepares all the neccessary response headers (like content-length, content-type etc)
-   Can handle etag
-   Can handle ranges

## Installation

To use the static file serving functionality, you need to install the `@wooksjs/http-static` package:

```bash
npm install @wooksjs/http-static
```

## Usage

Once installed, you can import the `serveFile` function and use it in your Wooks application.

Example:

```js
import { serveFile } from '@wooksjs/http-static';

app.get('static/file.txt', () => {
    // ...
    return serveFile('file.txt', { baseDir: 'public' });
});
```

The `serveFile` function takes the file path as the first argument and accepts an optional
options object as the second argument. It returns a readable stream of the file content.

## Options

The `options` object allows you to customize the behavior of the file serving. It provides the following properties:

-   `headers`: A `Record<string, string>` of additional response headers to set, in any casing; they replace the computed ones (e.g. `Content-Type`), except `Content-Length` and `Content-Range`, which always describe the bytes sent.
-   `cacheControl`: An object of Cache-Control directives (e.g. `{ maxAge: '10m', public: true }`); `maxAge`/`sMaxage` accept seconds or time strings.
-   `expires`: The Expires header value to specify the expiration date/time of the file.
-   `pragmaNoCache`: A boolean value indicating whether to add the Pragma: no-cache header.
-   `baseDir`: The base directory path for resolving the file path. Defaults to the process working directory (`process.cwd()`); it is also the boundary for the path-traversal check.
-   `defaultExt`: The default file extension appended when the path has none (e.g. `defaultExt: 'html'` serves `about` as `about.html`). The fallback is tried once, then cleared, so it does not recurse indefinitely.
-   `listDirectory`: A boolean value indicating whether to render an HTML directory listing when the path is a directory.
-   `index`: The filename of the index file to automatically serve when the path is a directory (e.g. `'index.html'`). If the URL has no trailing slash, the request is first redirected (`302`) to add one.
-   `allowDotDot`: When `true`, allows `../` parent-directory traversal in the requested path. **Defaults to `false`** — leave it off unless you fully control the input, as enabling it lets a crafted path escape `baseDir`.

::: warning Path traversal
With the default `allowDotDot: false`, any path that resolves outside `baseDir` is rejected with a `403` before touching the filesystem — `../` segments that stay inside `baseDir` are still allowed. Only enable `allowDotDot` for trusted, server-controlled paths — never for a segment taken straight from the URL (`get('*')`).
:::

## Built-in file server example:

Here's an example of using the `serveFile` function to create a built-in file server:

```js
import { useRouteParams } from '@wooksjs/event-http';
import { serveFile } from '@wooksjs/http-static';

app.get('static/*', () => {
    const { get } = useRouteParams();
    return serveFile(get('*'), { cacheControl: { maxAge: '10m' } });
});
```

See the [Cache Control documentation](./composables/response.md#cache-control) for details on configuring cache directives.

## Conditional Requests & Ranges

`serveFile` handles HTTP caching and partial transfers automatically — you don't wire anything up:

-   **ETag / Last-Modified.** Every file response gets an `ETag` (derived from inode, size, and mtime) and a `Last-Modified` header. On the next request the browser sends `If-None-Match` / `If-Modified-Since`; when the file is unchanged, `serveFile` responds **`304 Not Modified`** with no body. The rules are the same as for every response ([Conditional GET](./composables/response.md#conditional-get-304)): weak `If-None-Match` comparison with lists and `*`, a strict HTTP-date for `If-Modified-Since` compared at whole seconds, and preconditions checked before `Range`. The `304` carries `ETag`, `Last-Modified` and your cache headers. `If-Match` (strong comparison) and `If-Unmodified-Since` are checked first: a stale one answers `412 Precondition Failed` for any method. A `412` or `416` is an error response: it carries `Cache-Control: no-store` instead of your cache options, so caches never keep it. For a method other than GET/HEAD (when `serveFile` is mounted with `app.all`), a matching `If-None-Match` also answers `412`.
-   **Range requests.** For a GET with a `Range` header, `serveFile` streams only the requested byte range with **`206 Partial Content`** and a `Content-Range` header: `bytes=a-b`, `bytes=a-` and the suffix form `bytes=-n` (the last n bytes). A range starting past the end (or `bytes=-0`, or any range on an empty file) answers `416` with `Content-Range: bytes */<size>`. The unit is case-insensitive (`BYTES=0-1` works). Several ranges, another unit, or invalid syntax are ignored and the whole file is sent (`200`), as RFC 9110 allows. Other methods, HEAD included, ignore `Range`. An `If-Range` header is honored with strong comparison: the range is sent only when it names this exact `ETag` (a weak `W/` tag never matches) or the exact `Last-Modified` date of a file not modified within the current second (a date is weak while another change in that second would carry it); otherwise the full file is sent, whatever the `Range` says. Every file response advertises `Accept-Ranges: bytes`.

These make `serveFile` suitable for large downloads, video/audio seeking, and resumable transfers without extra configuration.
