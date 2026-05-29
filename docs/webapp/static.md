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
    return serveFile('file.txt', options);
});
```

The `serveFile` function takes the file path as the first argument and accepts an optional
options object as the second argument. It returns a readable stream of the file content.

## Options

The `options` object allows you to customize the behavior of the file serving. It provides the following properties:

-   `headers`: A `Record<string, string>` of additional response headers to set.
-   `cacheControl`: The Cache-Control header value for caching control. You can provide a string or an object with cache control directives.
-   `expires`: The Expires header value to specify the expiration date/time of the file.
-   `pragmaNoCache`: A boolean value indicating whether to add the Pragma: no-cache header.
-   `baseDir`: The base directory path for resolving the file path.
-   `defaultExt`: The default file extension appended when the path has none (e.g. `defaultExt: 'html'` serves `about` as `about.html`). The fallback is tried once, then cleared, so it does not recurse indefinitely.
-   `listDirectory`: A boolean value indicating whether to render an HTML directory listing when the path is a directory.
-   `index`: The filename of the index file to automatically serve when the path is a directory (e.g. `'index.html'`). If the URL has no trailing slash, the request is first redirected (`302`) to add one.
-   `allowDotDot`: When `true`, allows `../` parent-directory traversal in the requested path. **Defaults to `false`** — leave it off unless you fully control the input, as enabling it lets a crafted path escape `baseDir`.

::: warning Path traversal
With the default `allowDotDot: false`, any path containing `../` is rejected before touching the filesystem. Only enable `allowDotDot` for trusted, server-controlled paths — never for a segment taken straight from the URL (`get('*')`).
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

-   **ETag / Last-Modified.** Every file response gets an `ETag` (derived from inode, size, and mtime) and a `Last-Modified` header. On the next request the browser sends `If-None-Match` / `If-Modified-Since`; when the file is unchanged, `serveFile` responds **`304 Not Modified`** with no body. (Directory listings skip these headers.)
-   **Range requests.** When the client sends a `Range` header, `serveFile` streams only the requested byte range with **`206 Partial Content`** and a `Content-Range` header. An `If-Range` header is honored — if the validator no longer matches, the full file is sent instead. Every response advertises `Accept-Ranges: bytes`.

These make `serveFile` suitable for large downloads, video/audio seeking, and resumable transfers without extra configuration.
