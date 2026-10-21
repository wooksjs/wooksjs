# Locale

Wooks carries **which locale a request wants**. It does not translate anything. Pick the locale with your own policy, read it anywhere with `useLocale()`, and translate with any i18n library (i18next, FormatJS, vue-i18n on the server, a plain map).

```ts
import { createHttpApp, useAcceptLanguage, useCookies, useLocale } from '@wooksjs/event-http'

const app = createHttpApp({
  // your policy: a cookie first, then the Accept-Language header
  resolveLocale: () =>
    useCookies().getCookie('lang') ?? useAcceptLanguage().negotiate(['en', 'de', 'pt-BR'], 'en'),
})

app.get('/hello', () => t(useLocale().get(), 'hello'))
```

## `useLocale()`

`useLocale()` comes from `@wooksjs/event-core` (it is also re-exported by every adapter package) and works for any event kind.

| Call | Does |
|---|---|
| `get()` | Returns the locale of this event, or of a parent event, else `undefined`. A workflow started from a request reads the request's locale. |
| `set('de')` | Sets the locale for this event and its child events. A parent never sees it. |
| `set(() => …)` | Sets a lazy resolver. It runs on the first `get()`, once, and the value is kept. If it throws, the next `get()` runs it again. |
| `set(undefined)` | Clears the locale for this event. |

`createHttpApp({ resolveLocale })` installs your policy as that lazy resolver on every request. A request that never reads the locale never runs it, and gets no `Vary` header from it. An in-process [`app.fetch()`](./fetch.md) made while handling a request uses the caller's locale when it has one.

## `useAcceptLanguage()`

`negotiate(available, fallback?)` picks one of your languages from the request's `Accept-Language` header. It returns the tag as spelled in `available`, or `fallback` (otherwise `undefined`). **Every call adds `Vary: Accept-Language`** to the response, because the result shapes it.

| Header | `available` | Result |
|---|---|---|
| `de-DE,de;q=0.9,en;q=0.8` | `['en', 'de']` | `de` |
| `de-CH` | `['en', 'de']` | `de` (the range shortened) |
| `en` | `['en-US', 'en-GB']` | `en-US` (first tag the range covers) |
| `fr;q=0.5, en;q=0.9` | `['fr', 'en']` | `en` (by `q`, then header order) |
| `ru;q=0, *` | `['ru', 'en']` | `en` (`q=0` means "not acceptable") |

The algorithm is RFC 4647 lookup (shortening a range) combined with basic filtering (a range also covers the more specific tags under it). Ranges are matched case-insensitively, and malformed entries are skipped. A `q=0` range excludes every tag it covers, even one that a more specific range lists: `en;q=0, en-US` excludes `en-US` too. `languages()` lists the acceptable ranges, most preferred first. `acceptLanguage` is the raw header.

## Translating error bodies

Throw errors with a stable `code` and `params` ([Error codes](./composables/response.md#error-codes-and-params)), then translate them in one place with [`transformErrorBody`](./composables/response.md#transforming-every-error-body):

```ts
const app = createHttpApp({
  resolveLocale: () => useAcceptLanguage().negotiate(['en', 'de'], 'en'),
  transformErrorBody: (body) =>
    body.code ? { ...body, message: t(useLocale().get(), body.code, body.params) ?? body.message } : body,
})
```

Workflow forms and envelopes have their own hook: [`renderEnvelope`](../wf/outlets.md#transactions-and-envelopes).

## DOs and DON'Ts

- **Do** keep the whole policy (query, cookie, user setting, header) inside `resolveLocale`, so every event agrees on one answer.
- **Do** let `negotiate()` add `Vary`. If your policy reads a cookie, add `useResponse().vary('Cookie')` as well, so caches don't mix languages.
- **Don't** call `negotiate()` with an empty `available` list and no fallback. The result is `undefined`.
- **Don't** expect wooks to load catalogs or format plurals. That is your i18n library's job.
