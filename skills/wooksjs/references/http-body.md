# @wooksjs/http-body — Request Body Parsing

`useBody()` parses the request body by Content-Type. See [http-request.md](http-request.md) for `rawBody()` and request limits, [event-http.md](event-http.md) for app setup.

## Quick start

```ts
import { useBody } from '@wooksjs/http-body'

app.post('/api/data', async () => {
  const { is, parseBody, rawBody } = useBody()
  if (is('json')) {
    const data = await parseBody<{ name: string }>()
    return { received: data.name }
  }
  return (await rawBody()).toString()
})
```

- `is(type)` — Content-Type check. Accepts short names (`KnownContentType`: `json`, `html`, `xml`, `text`, `binary`, `form-data`, `urlencoded`) or any raw MIME string.
- `parseBody<T>()` — async; reads + parses, dispatched by Content-Type.
- `rawBody` — same function as `useRequest().rawBody()` (`Promise<Buffer>`).

## `parseBody()` dispatch by Content-Type

| Content-Type contains               | Result                                                                                                  |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `application/json`                  | Parsed object/array; syntax error → `HttpError 400`                                                       |
| `multipart/form-data`               | `Record<string, unknown>` (null-prototype); parts declaring `content-type: application/json` are JSON-parsed |
| `application/x-www-form-urlencoded` | Plain object via `WooksURLSearchParams.toJson()` — same rules as `useUrlParams().toJson()` ([http-request.md](http-request.md#useurlparamsctx)) |
| anything else                       | Raw body as string (no error)                                                                              |

## Rules & invariants

1. **The first `parseBody()` result is cached per context** — every subsequent call returns the same result regardless of the generic. `<T>` is a cast, not validation.
2. **JSON: prototype-pollution keys rejected.** `__proto__` / `constructor` / `prototype` anywhere in the parsed tree → `HttpError 400` (same as JSON syntax errors).
3. **Multipart limits are hardcoded:** 255 parts, 100-char field names, 100 KB per field — exceeding any → `HttpError 413`. Missing part name or a proto-pollution field name → `HttpError 400`.
4. **Multipart is text-only.** The body is decoded to a string and split by lines — binary uploads are not byte-preserved. Use `rawBody()` for binary payloads.
5. **Unknown Content-Type falls back to a raw string** — no error thrown.
6. `is(type)` is substring matching against the Content-Type header — `is('json')` also matches `application/json; charset=utf-8`.
7. Body reading goes through `useRequest().rawBody()` — size/timeout limits apply first (`413`/`415`/`408`); see [http-request.md](http-request.md).
8. Urlencoded inherits `toJson()` rules: array keys need the `[]` suffix (kept in the key), repeated non-`[]` keys → `HttpError 400`, proto keys → `400`, null-prototype result.

## Seeding a child context's body — `seedBody(ctx, body, { raw?, contentType? })`

For running handler logic in a child `EventContext` (`new EventContext({ logger, parent })`) with its own payload:

```ts
const child = new EventContext({ logger: parent.logger, parent })
seedBody(child, { ids: [1, 2] })             // parseBody() → value, rawBody() → JSON bytes, is('json') → true
await run(child, () => handler())
```

| # | Rule |
| - | ---- |
| 1 | Seed BEFORE anything in the child reads the body; the parent's body / cached composables are never touched. |
| 2 | Without `seedBody` a child's `useBody()` / `useRequest().rawBody()` read the PARENT's body (read-through) — always seed when the child needs a different payload. `seedRawBody(ctx, raw)` (`@wooksjs/event-http`) seeds ONLY `rawBody()` — a parent's parsed `useBody()` is still read through. |
| 3 | Defaults: `raw` = string/Buffer as-is else `JSON.stringify`; `contentType` = `text/plain` / `application/octet-stream` / `application/json` (request's when `body` is `undefined`). |
| 4 | Bytes to be parsed like a request: `seedBody(ctx, undefined, { raw, contentType? })`. |
| 5 | Headers (`content-type`, `content-length`), `url` stay the parent's — only body readers change. |

## Key imports

```ts
import { seedBody, useBody } from '@wooksjs/http-body'
import type { KnownContentType } from '@wooksjs/http-body'
```

## See also

- Docs: https://wooks.moost.org/webapp/body.html
- Source: `packages/http-body/src/body.ts`
- [http-request.md](http-request.md) — `rawBody()`, request limits, `useUrlParams().toJson()` rules
- [http-response.md](http-response.md#testing) — testing body parsing with `prepareTestHttpContext`
