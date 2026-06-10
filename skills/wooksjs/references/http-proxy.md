# @wooksjs/http-proxy — Reverse Proxy Composable

Forward the current HTTP request to an upstream target with explicit header/cookie filtering. See [event-http.md](event-http.md) for app setup, [http-request.md](http-request.md) / [http-response.md](http-response.md) for the underlying composables.

## Quick start

```ts
import { useProxy } from '@wooksjs/http-proxy'
import { useRequest } from '@wooksjs/event-http'

// Fixed target — the incoming path is NEVER auto-appended; this always hits /zen
app.get('/zen', () => useProxy()('https://api.github.com/zen'))

// Target built from request input — MUST set allowedHosts
app.get('*', () => {
  const { url } = useRequest()
  return useProxy()('https://api.example.com' + url, {
    allowedHosts: ['api.example.com'],          // reject any other resolved host with 502
    reqHeaders: { block: ['referer'] },         // omit reqHeaders → NO headers forwarded (see #1)
    resHeaders: { overwrite: { 'x-proxied-by': 'wooks' } },
  })
})
```

`useProxy()` returns `proxy(target, opts?)`, an async function returning the upstream `fetch` `Response`. It also writes the upstream status and the headers/cookies selected by `resHeaders`/`resCookies` back onto the current `HttpResponse`, so the returned `Response` can be returned directly from the handler (or read/modified first).

## `proxy(target, opts?)` options

| Option         | Type                                     | Effect                                                                 |
| -------------- | ---------------------------------------- | --------------------------------------------------------------------- |
| `method`       | `string`                                 | Override the forwarded method (default: incoming request method)       |
| `allowedHosts` | `Array<string \| RegExp>`                | Allowlist of upstream hostnames; non-matching host → `502`. See #4     |
| `reqHeaders`   | `TWooksProxyControls`                    | Filter/transform outgoing request headers                              |
| `reqCookies`   | `TWooksProxyControls`                    | Filter/transform outgoing request cookies (rebuilt into `cookie`)      |
| `resHeaders`   | `TWooksProxyControls`                    | Filter/transform incoming response headers                             |
| `resCookies`   | `TWooksProxyControls`                    | Filter/transform incoming response cookies (re-emitted via Set-Cookie) |
| `debug`        | `boolean`                                | Log forwarded method/URL and filtered headers/cookies                  |

**`TWooksProxyControls`** (same shape for all four filters): `allow?: Array<string|RegExp> | '*'`, `block?: Array<string|RegExp> | '*'`, `overwrite?: Record<string,string> | (data) => Record<string,string>`. Semantics: `allow` defaults to `'*'` whenever the controls object is given (so `{}`, `{ block }`, `{ overwrite }` all forward everything except hard-blocked); `block` wins over `allow`; `overwrite` runs after filtering — Record form shallow-merges over the filtered result (can re-introduce hard-blocked keys), function form receives the filtered record and its return value replaces it entirely (spread to keep existing keys).

## Rules & invariants

1. **Default-deny on all four channels.** Omit `reqHeaders` → the proxy forwards no incoming request headers upstream (no `authorization`, no `content-type`; Node's fetch still adds its own wire-level defaults such as `accept`/`user-agent`/`host`); omit `reqCookies` → no cookies; omit `resHeaders`/`resCookies` → upstream headers/Set-Cookie are not applied to the outgoing response. Pass `reqHeaders: { allow: '*' }` (etc.) to forward — `'*'` includes `authorization`, so allowlist explicitly to avoid leaking credentials upstream. The upstream status is always copied; when the fetch `Response` is returned from the handler, event-http copies its `content-type`/`content-length` itself.
2. **Host is locked to the parsed target.** The upstream authority (protocol/host/port) comes solely from `new URL(target)`; the path is never re-parsed against the origin, so request-derived path data cannot hijack the destination host (SSRF-safe). Attacker-controlled path data influences only the forwarded path.
3. **The incoming path/query are never auto-appended** — the upstream URL is exactly the `target` you pass. Concatenate `useRequest().url` (or a wildcard route param) yourself.
4. **Set `allowedHosts` whenever `target` includes request input** (e.g. `'https://host' + useRequest().url`). It is the explicit SSRF gate: strings match the hostname case-insensitively, `RegExp` is tested against the hostname, non-match → `502`. An empty array denies every host; omitting it applies no restriction.
5. **Only `http:`/`https:` targets are accepted** — any other protocol → `502`. Invalid target URL → `502`. Fragment is stripped; query string is preserved.
6. **Hard-blocked request headers:** `connection`, `accept-encoding`, `content-length`, `upgrade-insecure-requests`, `cookie` — stripped regardless of `allow` (even `allow: '*'` or naming them explicitly). Only `overwrite` can re-introduce a hard-blocked key; for cookies use `reqCookies` instead.
7. **Hard-blocked response headers:** `transfer-encoding`, `content-encoding`, `set-cookie` — same rule; selected response cookies are re-emitted through `response.setCookieRaw()`.
8. **`host` is preset to the target hostname** before `reqHeaders` filtering — never forward the incoming Host manually.
9. `GET`/`HEAD` omit the body; other methods stream the incoming request body through `fetch`.
10. Not a transport-level reverse proxy (Nginx/Envoy) — it rewrites/filters metadata to coexist with the Wooks response model.

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
