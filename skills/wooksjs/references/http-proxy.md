# @wooksjs/http-proxy — Reverse Proxy Composable

Forward the current HTTP request to an upstream target with explicit header/cookie filtering. See [event-http.md](event-http.md) for app setup, [http-request.md](http-request.md) / [http-response.md](http-response.md) for the underlying composables.

## Quick start

```ts
import { useProxy } from '@wooksjs/http-proxy'

// Fixed target — safe
app.get('/gh/*', () => useProxy()('https://api.github.com'))

// Target built from request input — MUST set allowedHosts
app.get('*', () => {
  const { url } = useRequest()
  return useProxy()('https://api.example.com' + url, {
    allowedHosts: ['api.example.com'],          // reject any other resolved host with 502
    reqHeaders: { block: ['referer'] },
    resHeaders: { overwrite: { 'x-proxied-by': 'wooks' } },
  })
})
```

`useProxy()` returns `proxy(target, opts?)`, an async function returning the upstream `fetch` `Response`. It also writes the upstream status and selected headers/cookies back onto the current `HttpResponse`, so the returned `Response` can be returned directly from the handler (or read/modified first).

## `proxy(target, opts?)` options

| Option         | Type                                     | Effect                                                                 |
| -------------- | ---------------------------------------- | --------------------------------------------------------------------- |
| `method`       | `string`                                 | Override the forwarded method (default: incoming request method)       |
| `allowedHosts` | `Array<string \| RegExp>`                | Allowlist of upstream hostnames; non-matching host → `502`. See #2     |
| `reqHeaders`   | `TWooksProxyControls`                    | Filter/transform outgoing request headers                              |
| `reqCookies`   | `TWooksProxyControls`                    | Filter/transform outgoing request cookies (rebuilt into `cookie`)      |
| `resHeaders`   | `TWooksProxyControls`                    | Filter/transform incoming response headers                             |
| `resCookies`   | `TWooksProxyControls`                    | Filter/transform incoming response cookies (re-emitted via Set-Cookie) |
| `debug`        | `boolean`                                | Log forwarded method/URL and filtered headers/cookies                  |

**`TWooksProxyControls`** (same shape for all four filters): `allow?: Array<string|RegExp> | '*'`, `block?: Array<string|RegExp> | '*'`, `overwrite?: Record<string,string> | (data) => Record<string,string>`. Order: allow/block filter first, then `overwrite`.

## Rules & invariants

1. **Host is locked to the parsed target.** The upstream authority (protocol/host/port) comes solely from `new URL(target)`; the path is never re-parsed against the origin, so request-derived path data cannot hijack the destination host (SSRF-safe). Attacker-controlled path data influences only the forwarded path.
2. **Set `allowedHosts` whenever `target` includes request input** (e.g. `'https://host' + useRequest().url`). It is the explicit SSRF gate: strings match the hostname case-insensitively, `RegExp` is tested against the hostname, non-match → `502`. An empty array denies every host; omitting it applies no restriction.
3. **Only `http:`/`https:` targets are accepted** — any other protocol → `502`. Invalid target URL → `502`. Fragment is stripped; query string is preserved.
4. **`cookie` is blocked on the request path by default** (use `reqCookies` to forward selected cookies). Other default-blocked request headers: `connection`, `accept-encoding`, `content-length`, `upgrade-insecure-requests`.
5. **`reqHeaders`/`reqCookies` default `allow` to `'*'`** when only `block` is given — i.e. everything except the default-blocked set is forwarded, including `authorization`. Allowlist explicitly to avoid leaking credentials upstream.
6. **Default-blocked response headers:** `transfer-encoding`, `content-encoding`, `set-cookie` (selected response cookies are re-emitted through `response.setCookieRaw()`).
7. `GET`/`HEAD` omit the body; other methods stream the incoming request body through `fetch`.
8. Not a transport-level reverse proxy (Nginx/Envoy) — it rewrites/filters metadata to coexist with the Wooks response model.

## Key imports

```ts
import { useProxy } from '@wooksjs/http-proxy'
import type { TWooksProxyOptions, TWooksProxyControls } from '@wooksjs/http-proxy'
import { useRequest } from '@wooksjs/event-http' // to build request-derived targets
```

## See also

- Docs: https://wooks.moost.org/webapp/proxy.html
- Source: `packages/http-proxy/src/proxy.ts`, `proxy-utils.ts`
- [http-response.md](http-response.md) — `setCookieRaw`, header/cookie mechanics on the response side
