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

Once installed, you can import the `serveFile` function and use it in your WooksJS application.

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

-   `headers`: An object containing additional headers to add to the response.
-   `cacheControl`: The Cache-Control header value for caching control. You can provide a string or an object with cache control directives.
-   `expires`: The Expires header value to specify the expiration date/time of the file.
-   `pragmaNoCache`: A boolean value indicating whether to add the Pragma: no-cache header.
-   `baseDir`: The base directory path for resolving the file path.
-   `defaultExt`: The default file extension to be added to the file path if no file extension is provided.
-   `listDirectory`: A boolean value indicating whether to list files in a directory if the file path corresponds to a directory.
-   `index`: The filename of the index file to automatically serve from the folder if present.

## Built-in file server example:

Here's an example of using the `serveFile` function to create a built-in file server:

```js
import { useRouteParams } from 'wooks';
import { serveFile } from '@wooksjs/http-static';

app.get('static/*', () => {
    const { get } = useRouteParams();
    return serveFile(get('*'), { cacheControl: { maxAge: '10m' } });
});
```

In the example above, any request to the `/static/*` route will serve the corresponding file from the file system.
The file path is extracted from the route parameters, and the `cacheControl` option is used to set the caching behavior of the response.

You can refer to the [Cache Control documentation](./composables/response.md#cache-control) for more details on how to configure the cache control directives.

That's how you can use the `@wooksjs/http-static` package to serve static files in your Wooks HTTP application.
