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

## Key imports

```ts
import { useBody } from '@wooksjs/http-body'
import type { KnownContentType } from '@wooksjs/http-body'
```

## See also

- Docs: https://wooks.moost.org/webapp/body.html
- Source: `packages/http-body/src/body.ts`
- [http-request.md](http-request.md) — `rawBody()`, request limits, `useUrlParams().toJson()` rules
- [http-response.md](http-response.md#testing) — testing body parsing with `prepareTestHttpContext`
