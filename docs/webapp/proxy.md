# Proxy Requests

The `@wooksjs/http-proxy` package provides a convenient way to proxy requests in Wooks HTTP.
It allows you to easily proxy requests to another server or API.

## Installation

To use the proxy functionality, you need to install the `@wooksjs/http-proxy` package:

```bash
npm install @wooksjs/http-proxy
```

## Usage

Once installed, you can import and use the `useProxy` composable function in your Wooks application.

Example:
```js
import { useProxy } from '@wooksjs/http-proxy'

app.get('/to-proxy', () => {
    const proxy = useProxy()
    return proxy('https://target-website.com/target-path?query=123')
})
```

The `useProxy` function returns a function that you can call with the target URL you want to proxy.
The function will make the proxy request and return the `fetch` response from the target server.

By default the proxy forwards **no** request headers or cookies and applies **no** upstream response headers — forwarding is opt-in.
Pass `reqHeaders: { allow: '*' }` (or any controls object) to forward incoming headers, `reqCookies` to forward cookies,
and `resHeaders`/`resCookies` to apply upstream response headers/cookies to the outgoing response.
When you return the fetch response from the handler, the upstream status, `content-type`, and `content-length` are applied automatically.

## Choose which cookies/headers to pass

You can choose the cookies and headers that are passed in the proxy request by passing
the `reqCookies` and `reqHeaders` options to the `proxy` function returned by `useProxy`.
Providing a controls object defaults `allow` to `'*'`, so everything passes unless blocked.

Example:
```js
import { useProxy } from '@wooksjs/http-proxy';

app.get('/to-proxy', () => {
    const proxy = useProxy();
    return proxy('https://target-website.com/target-path?query=123', {
        reqHeaders: { block: ['referer'] }, // Block the referer header
        reqCookies: { block: '*' }, // Block all request cookies
    });
});
```

In the example above, the referer header is blocked, and all request cookies are blocked from being passed in the proxy request.

## Change Response

The proxy function returned by `useProxy` behaves like a regular fetch call and returns a `fetch` response.
You can modify the response or access its data before returning it from the handler.

Example:
```js
import { useProxy } from '@wooksjs/http-proxy';

app.get('/to-proxy', async () => {
    const proxy = useProxy();
    const response = await proxy('https://myapi.com/json-api');
    const data = { ...(await response.json()), newField: 'new value' };
    return data;
});
```

In the example above, the `proxy` function is used to make the proxy request,
and the response is then modified by adding a new field before returning it from the handler.

## Advanced Options

The `proxy` function accepts advanced options for customizing the proxy behavior.
You can specify options such as the request method, filtering request and response headers/cookies, overwriting data, and enabling debug mode.

Example:

```js
import { useProxy } from '@wooksjs/http-proxy';
import { useRequest } from '@wooksjs/event-http';

app.get('*', async () => {
    const proxy = useProxy();
    const { url } = useRequest();
    const fetchResponse = await proxy('https://www.google.com' + url, {
        method: 'GET', // Optional method, defaults to the original request method

        // Restrict the upstream host (recommended when the target is built from request input)
        allowedHosts: ['www.google.com'],

        // Filtering options for request headers/cookies
        reqHeaders: { block: ['referer'] },
        reqCookies: { allow: ['cookie-to-pass-upstream'] },

        // Filtering options for response headers/cookies
        resHeaders: { overwrite: { 'x-proxied-by': 'wooks-proxy' } },
        resCookies: { allow: ['cookie-to-pass-downstream'] },

        debug: true, // Enable debug mode to print proxy paths and headers/cookies
    });

    return fetchResponse;
});
```

The `fetchResponse` can be returned directly from the handler, or you can modify it before returning.

::: warning Securing the upstream host
The proxy fixes the upstream host to whatever `new URL(target)` resolves, so request **path** data cannot redirect the request to another host. When you build the target from request input (as in `'https://www.google.com' + url` above), also set `allowedHosts` to the hostnames you trust — the proxy then rejects any resolved host outside the list with `502`. Only `http:`/`https:` targets are allowed. `allowedHosts` accepts exact hostname strings (case-insensitive) or `RegExp` entries; an empty array denies every host.
:::

## Header & Cookie Controls

The four filtering options — `reqHeaders`, `reqCookies`, `resHeaders`, `resCookies` — all take the same **controls** object. Each field is optional and they compose (allow/block filter, then `overwrite` is applied):

| Field | Type | Behavior |
|-------|------|----------|
| `allow` | `Array<string \| RegExp>` or `'*'` | Allowlist of keys to forward. Strings match by name; `RegExp` matches the key. `'*'` allows all. |
| `block` | `Array<string \| RegExp>` or `'*'` | Blocklist of keys to suppress. `'*'` blocks all. |
| `overwrite` | `Record<string, string>` or `(data) => Record<string, string>` | Override specific key→value pairs, or pass a function that receives the current map and returns the replacement map. |

`block` wins over `allow`; `allow` defaults to `'*'` when a controls object is given. `overwrite` runs after filtering and can still force any key.

Some headers are always stripped regardless of `allow`:

-   **Request:** `connection`, `accept-encoding`, `content-length`, `upgrade-insecure-requests`, `cookie` — forward cookies via `reqCookies`, not `reqHeaders`.
-   **Response:** `transfer-encoding`, `content-encoding`, `set-cookie` — apply cookies via `resCookies`.

```js
import { useProxy } from '@wooksjs/http-proxy';

app.get('*', () => {
    const proxy = useProxy();
    return proxy('https://upstream.example.com', {
        // RegExp + string allowlist
        reqHeaders: { allow: [/^x-/, 'authorization'] },
        // block all upstream cookies
        resCookies: { block: '*' },
        // function form — derive headers from the existing set
        resHeaders: {
            overwrite: (headers) => ({ ...headers, 'x-proxied-by': 'wooks-proxy' }),
        },
    });
});
```

Other `proxy` options: `method` (override the proxied HTTP method, defaults to the incoming request's method), `allowedHosts` (allowlist of upstream hostnames — strings or `RegExp` — rejecting any other resolved host with `502`), and `debug` (log proxy paths, headers, and cookies).
