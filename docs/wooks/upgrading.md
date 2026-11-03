# Upgrading to 0.8

Wooks `0.8.0` is a breaking release for `@wooksjs/event-http`, `@wooksjs/event-wf` and `@wooksjs/http-static`. `@wooksjs/event-core`, `event-cli`, `event-ws` and `wooks` gain only the new `useLocale()` export. Bump every `@wooksjs/*` package and `wooks` together: they share one version.

This page is a checklist. Each row says what changed and what to do; the linked page holds the full rules.

## HTTP (`@wooksjs/event-http`)

### Durations are seconds

```ts
// before 0.8: numbers were divided by 1000, so code multiplied to compensate
useResponse().setCookie('session', id, { maxAge: 3600 * 1000 })
// 0.8: a number is seconds
useResponse().setCookie('session', id, { maxAge: 3600 }) // or maxAge: '1h'
```

| Change | What to do |
|---|---|
| Cookie `maxAge`, `setCacheControl({ maxAge, sMaxage })` and `setAge()` read a number as **seconds**. Before, `maxAge: 86400` rendered `max-age=86.4`. | Remove every `* 1000` you added for these. Timestamps (`expires`, `setExpires()`) stay in milliseconds. |
| A string that is not a duration throws `TypeError`, including bare digits (`'3600'`), `''` and `'15x'`. Non-finite numbers throw too. | Pass a number, or a string with a unit (`'1h'`, `'1.5h'`). |

Details: [Duration units](../webapp/composables/response.md#cookies).

### Default statuses

| Change | What to do |
|---|---|
| `PUT`, `PATCH` and `DELETE` that return a body now answer **200** (were 201 / 202 / 202). `POST` with a body stays 201; no body is 204. | Update tests and clients that expect 201/202. Set `202` yourself (`setStatus(202)`) where a handler only queues work. Tools that document responses can reuse `DEFAULT_HTTP_STATUS` / `getDefaultHttpStatus()`. |

Details: [Status](../webapp/composables/response.md#status).

### Client IP, protocol and host behind a proxy

| Change | What to do |
|---|---|
| `getIp({ trustProxy: true })` is deprecated. It now trusts **one** hop and takes the right-most `X-Forwarded-For` entry (the left-most one is client-forgeable). | Configure `createHttpApp({ trustProxy: 1 })` (or a list of proxy addresses) and call `getIp()` with no arguments. `protocol()` and `host()` follow the same setting. |
| `getIp()` returns IPv4-mapped addresses (`::ffff:10.0.0.5`) as plain IPv4. A malformed forwarding entry written by a trusted hop gives `''`. | Don't compare against `::ffff:` forms. Treat `''` as "client unknown". |
| `app.fetch()` / `app.request()` with no calling request no longer fakes `127.0.0.1`: `getIp()` is `''` and `protocol()` / `host()` come from the Request URL. | On Bun, Deno or edge runtimes pass the peer: `app.fetch(request, { remoteAddress, encrypted })`. |

Details: [Behind a Proxy](../webapp/proxy-trust.md).

### Conditional requests

| Change | What to do |
|---|---|
| Every GET/HEAD `200` with an `ETag` or `Last-Modified` answers a matching `If-None-Match` / `If-Modified-Since` with `304` — also when you set the `ETag` yourself. `If-None-Match: *` gives `304` for any GET/HEAD `200`. | Remove hand-written `304` logic that compared `If-None-Match` itself. |
| GET and HEAD now honour `If-Match` / `If-Unmodified-Since`: a stale one turns a 2xx answer into **412**. Weak ETags never satisfy `If-Match`. | Clients that send `If-Match` on reads must send a strong tag. With compression on, the client receives a weakened `W/"…"` ETag; see the lost-update recipe. |
| A `304` carries the validators of the `200` it confirms (the weakened ETag when compressed). | Nothing, unless a test asserted the strong tag on a compressed `304`. |

Details: [Conditional GET (304)](../webapp/composables/response.md#conditional-get-304) and [Lost-update protection](../webapp/composables/response.md#lost-update-protection-optimistic-concurrency).

### Headers and bodies

| Change | What to do |
|---|---|
| Error responses are never cacheable: `Cache-Control` / `Expires` and representation headers set before a failure are dropped, and `Cache-Control: no-store` is sent. | For a cacheable error, build the response yourself: `setStatus(404)`, your cache headers and a returned body. |
| Response header names are stored lower-case; `setHeader('ETag')` replaces an earlier `etag`, and `headers()` returns lower-case keys. | Read `headers()` with lower-case keys. |
| `Content-Length` always matches the bytes sent. A returned fetch `Response` keeps its own `Content-Length`; a `204` has none. | Don't set `Content-Length` for regular bodies. |
| HEAD answers with the headers GET would send, including the compression negotiation. | Nothing, unless a test expected identity headers on HEAD. |
| `defaultHeaders` is read once, when the app is created. | Don't mutate the object afterwards; set per-response headers with `setHeader()`. |

Details: [Headers](../webapp/composables/response.md#headers), [Compression](../webapp/compression.md).

### Errors

| Change | What to do |
|---|---|
| `HttpError` is typed `HttpError<T extends object>`. A body object needs `message`, may carry `code` (UPPER_SNAKE) and `params`, and no longer needs `statusCode`. | Drop `statusCode` from body objects; it always comes from the first argument. |
| `transformErrorBody` also sees the router's `404` and non-`HttpError` `500`s. Its result is used only when it is a plain object with a numeric `statusCode` and a string `message`. | Make the hook handle bodies without `code`, return synchronously, and keep both fields. |

Details: [Error Responses](../webapp/composables/response.md#error-responses).

## Static files (`@wooksjs/http-static`)

| Change | What to do |
|---|---|
| `serveFile` preconditions follow RFC 9110: a stale `If-Match` / `If-Unmodified-Since` gives `412` for any method; a matching `If-None-Match` gives `304` for GET/HEAD and `412` for other methods. | Nothing for plain GET serving. |
| `Range` is honoured for GET only; an unsatisfiable range gives `416` with `Content-Range: bytes */size`; multi-range or bad syntax gives the full `200`. `If-Range` uses strong comparison. | Don't rely on `206` for HEAD. |
| `options.headers` can no longer override `Content-Length` / `Content-Range`. `412` / `416` are sent with `Cache-Control: no-store`. | Remove such overrides. |

Details: [Serve Static](../webapp/static.md#conditional-requests-ranges).

## Workflows (`@wooksjs/event-wf`)

| Change | What to do |
|---|---|
| The trigger's `allow` / `block` lists apply to **start and resume** and judge the resolved flow, not the id spelling. | Use `createOutletHandler(wfApp)` so the trigger can resolve flow ids. |
| `allow` fails closed: an entry must equal the registered flow id (the pattern for a parametric flow, e.g. `'user/:id'`). **`allow: []` now admits nothing** (it admitted everything). | List registered ids, not instance ids. Remove `allow: []` if you meant "no restriction". |
| Refusals are thrown as `HttpError` with a `code` (`WF_MISSING`, `WF_INVALID`, `WF_INVALID_TOKEN`, `WF_EXPIRED`, `WF_FORBIDDEN`, `WF_NOT_FOUND`, `WF_UNKNOWN_OUTLET`). The text moved from `body.error` to `body.message`; `error` is now the status text. Statuses are unchanged. | Read `body.message ?? body.error` (works with both versions), or switch on `body.code`. |
| `createOutletHandler()` takes `WfOutletTriggerDeps`, so apps created with `createWfApp<T>()` type-check. | Remove casts you added to pass a typed app. |

Details: [Access Control](../wf/outlets.md#access-control) and [Refusals](../wf/outlets.md#refusals-error-codes).

## New in 0.8

Not breaking, but worth knowing while you upgrade:

- [Proxy trust](../webapp/proxy-trust.md): `trustProxy`, `proxyHeaders`, `compileTrustProxy()`, `resolveForwarded()`.
- [Locale](../webapp/locale.md): `useLocale()` for every event kind, `useAcceptLanguage().negotiate()`, `createHttpApp({ resolveLocale })`.
- [Error codes](../webapp/composables/response.md#error-codes-and-params) and [`transformErrorBody`](../webapp/composables/response.md#transforming-every-error-body) for translating error bodies.
- [`checkPreconditions()`](../webapp/composables/response.md#lost-update-protection-optimistic-concurrency), `parseHttpDate()`, [`useResponse().vary()`](../webapp/composables/response.md#vary), and a custom ETag for `prerenderJson()`.
- Workflow trigger hooks [`around`, `beforePersist`, `renderEnvelope`](../wf/outlets.md#transactions-and-envelopes), [`restoreOnError`](../wf/outlets.md#retrying-a-failed-resume-restoreonerror) and [`mintWfToken()`](../wf/outlets.md#minting-a-token-without-a-request).

The full list is in the [changelog](https://github.com/wooksjs/wooksjs/blob/main/CHANGELOG.md).
