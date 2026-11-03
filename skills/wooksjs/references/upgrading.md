# Upgrading 0.7.x → 0.8

Load when bumping `@wooksjs/*` / `wooks` from 0.7.x to 0.8.x, or when 0.7-era code (or tests) misbehaves on 0.8. All `@wooksjs/*` packages and `wooks` share one version — bump them together. Breaking: `event-http`, `event-wf`, `http-static`. Docs: https://wooks.moost.org/wooks/upgrading

## Quick fixes

```ts
// durations: a number is SECONDS now — drop every *1000
setCookie('sid', id, { maxAge: 3600 }) // was { maxAge: 3600 * 1000 }
setCacheControl({ maxAge: '1h' }) // strings carry units; '3600' (bare digits) THROWS

// proxy trust: app-level, not per call
createHttpApp({ trustProxy: 1 }) // then useRequest().getIp() — no args
// was: getIp({ trustProxy: true })  (deprecated; now = trust ONE hop, right-most XFF)

// workflow trigger refusals are thrown HttpErrors: text moved to `message`
const text = body.message ?? body.error // works on 0.7 and 0.8; or switch on body.code
```

## Breaking changes → action

| #   | Area                 | 0.8 behaviour                                                                                                                                                                                                               | Action                                                                                                                                                                                    |
| --- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Durations            | Cookie `maxAge`, `setCacheControl({ maxAge, sMaxage })`, `setAge()`: number = seconds (was ÷1000). Bare digit strings, `''`, `'15x'`, non-finite numbers throw `TypeError`.                                                 | Remove `*1000`; use numbers or unit strings. Timestamps (`expires`, `setExpires`) stay ms. [http-response.md](http-response.md#duration-units)                                            |
| 2   | Default status       | PUT/PATCH/DELETE with body → 200 (were 201/202/202). POST → 201; no body → 204.                                                                                                                                             | Fix tests/clients expecting 201/202; `setStatus(202)` for queued work. `DEFAULT_HTTP_STATUS` / `getDefaultHttpStatus()` for tooling. [event-http.md](event-http.md#auto-status-inference) |
| 3   | Proxy                | `getIp({ trustProxy: true })` deprecated = one hop, right-most XFF; unknown peer → `''`. IPv4-mapped → plain IPv4. Malformed trusted entry → `''`.                                                                          | `createHttpApp({ trustProxy })`; `getIp()`/`protocol()`/`host()` with no args. [http-request.md](http-request.md#proxy-trust)                                                             |
| 4   | `app.fetch()`        | No caller → unknown peer (was fake `127.0.0.1`): `getIp()` `''`, protocol/host from Request URL.                                                                                                                            | Pass `app.fetch(req, { remoteAddress, encrypted })` on Bun/Deno/edge.                                                                                                                     |
| 5   | 304                  | Any GET/HEAD 200 with `ETag`/`Last-Modified` auto-answers `If-None-Match`/`If-Modified-Since` (explicit ETag included); `If-None-Match: *` → 304. 304 carries the weakened ETag when compressed.                            | Delete hand-rolled 304 checks. [http-response.md](http-response.md#conditional-get-304)                                                                                                   |
| 6   | 412                  | GET/HEAD 2xx + stale `If-Match` (strong only) / `If-Unmodified-Since` → 412.                                                                                                                                                | Strong ETag + `setCompression(false)` on GETs used for optimistic concurrency.                                                                                                            |
| 7   | Error caching        | Every error-path response drops `Cache-Control`/`Expires`/representation headers set earlier → `Cache-Control: no-store`.                                                                                                   | Cacheable failure = `setStatus(4xx)` + headers + returned body.                                                                                                                           |
| 8   | Headers              | Response header keys lower-case, case-insensitive; one line per name. `Content-Length` always = bytes sent (fetch `Response` keeps its own; none on 204). HEAD = GET's headers. `defaultHeaders` read once at app creation. | Read `headers()` lower-case; don't set `Content-Length` for values; don't mutate `defaultHeaders` later.                                                                                  |
| 9   | `HttpError`          | `HttpError<T extends object>`; body = `message` + optional `code`/`params`; `statusCode` not needed in body.                                                                                                                | Drop `statusCode` from body objects. [http-response.md](http-response.md#httperror-and-error-rendering)                                                                                   |
| 10  | `transformErrorBody` | Also sees router 404 and non-HttpError 500; result used only if plain object with numeric `statusCode` + string `message`.                                                                                                  | Handle bodies without `code`; return sync.                                                                                                                                                |
| 11  | `serveFile`          | RFC 9110 preconditions (412 any method; matching `If-None-Match` on non-GET/HEAD → 412); Range GET-only; 416 `bytes */size`; `options.headers` can't override `Content-Length`/`Content-Range`; 412/416 `no-store`.         | Remove length/range overrides. [http-static.md](http-static.md)                                                                                                                           |
| 12  | WF access            | Trigger `allow`/`block` enforced on start AND resume by resolved flow id. `allow` fails closed; **`allow: []` = none** (was all). Refused resume → 403, token kept.                                                         | List registered ids (pattern for parametric flows); use `createOutletHandler(wfApp)`. [wf-outlets.md](wf-outlets.md#access-control-allow--block)                                          |
| 13  | WF errors            | Refusals THROWN as `HttpError` with `WF_*` code; text in `message`, `error` = status text. Statuses unchanged.                                                                                                              | `body.message ?? body.error` or `body.code`. [wf-outlets.md](wf-outlets.md)                                                                                                               |
| 14  | WF typing            | `createOutletHandler(wfApp: WfOutletTriggerDeps)` accepts typed `createWfApp<T>()` apps.                                                                                                                                    | Remove casts.                                                                                                                                                                             |

## New APIs worth adopting

| Feature                                                                                                                                  | Where                                                              |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `useLocale()` (all kinds), `useAcceptLanguage().negotiate()`, `createHttpApp({ resolveLocale })`                                         | [event-core.md](event-core.md), [http-request.md](http-request.md) |
| `trustProxy`, `proxyHeaders`, `compileTrustProxy`, `resolveForwarded`                                                                    | [http-request.md](http-request.md#proxy-trust)                     |
| `checkPreconditions`, `parseHttpDate`, `useResponse().vary()`, `prerenderJson(obj, { etag: '"x"' })`                                     | [http-response.md](http-response.md)                               |
| Trigger `around`, `beforePersist`, `renderEnvelope`, `restoreOnError`/`maxRestores`, `mintWfToken`, `normalizeWfId`, `WF_TRIGGER_ERRORS` | [wf-outlets.md](wf-outlets.md)                                     |

## See also

- Changelog: https://github.com/wooksjs/wooksjs/blob/main/CHANGELOG.md
