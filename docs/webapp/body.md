# Body Parser

`@wooksjs/http-body` parses the request body based on `Content-Type` — on demand, cached per request.

Supported content types: `application/json`, `text/*`, `multipart/form-data`, `application/x-www-form-urlencoded`.

Nothing is parsed until you call `parseBody()`.

## Installation

```bash
npm install @wooksjs/http-body
```

## Usage

Once installed, you can import and use the `useBody` composable function in your Wooks application.

Example:
```js
import { useBody } from '@wooksjs/http-body'

app.post('test', async () => {
    const { parseBody } = useBody()
    const data = await parseBody()
})
```
The `useBody` function provides an `is(type)` checker and access to the raw body buffer.

Example:

```js
import { useBody } from '@wooksjs/http-body';

app.post('test', async () => {
    const {
        is, // checks the content type : (type) => boolean
        parseBody, // parses the body according to the content type : <T = unknown>() => Promise<T>;
        rawBody, // returns the raw body buffer : () => Promise<Buffer>;
    } = useBody();

    // Short names: 'json', 'html', 'xml', 'text', 'binary', 'form-data', 'urlencoded'
    // Or full MIME types: 'application/msgpack', 'image/png', etc.
    if (is('json')) {
        console.log(await parseBody());
    }
});
```

## Gotchas

-   **Malformed JSON and prototype-pollution keys throw `HttpError(400)`.** JSON bodies containing `__proto__`, `constructor`, or `prototype` keys are rejected; the same keys are rejected as urlencoded and form-data field names.
-   **Parsed form-data/urlencoded objects have a null prototype** — no `hasOwnProperty` or other `Object.prototype` methods.
-   **The built-in `multipart/form-data` parser handles text fields only.** Values are parsed line-by-line and trimmed, so binary file uploads are not preserved byte-for-byte — use `rawBody()` with a dedicated multipart library for file uploads. Limits (not configurable): 255 fields, 100-character field names, 100 KB per field value — exceeding them throws `HttpError(413)`.
-   **Unrecognized or missing `Content-Type` returns the body as a plain string** — no error is thrown.
-   **Body size and read-time limits apply** to `rawBody()`/`parseBody()` — see [Body Size Limits](/webapp/composables/request#body-size-limits).

## Seeding a Body in a Child Context

When one handler runs another handler's logic in-process with a *different* payload (a nested route invocation, a batch fanned out over child contexts), create a child `EventContext` ([parent contexts](/wooks/advanced/wooks-context#parent-contexts)) and seed its body with `seedBody()`. Inside the child, `useBody().parseBody()`, `useBody().rawBody()`, `useRequest().rawBody()` and `useBody().is()` answer from the seeded value; everything else (request, headers, auth, route params set on the child) still reads through the parent.

```ts
import { EventContext, current, run } from '@wooksjs/event-core'
import { seedBody, useBody } from '@wooksjs/http-body'

app.post('/batch', async () => {
    const parent = current()
    const child = new EventContext({ logger: parent.logger, parent })
    seedBody(child, { ids: [1, 2] })
    return run(child, async () => useBody().parseBody()) // { ids: [1, 2] }
})
```

Options (`seedBody(ctx, body, { raw?, contentType? })`):

| Option | Default | Effect |
| --- | --- | --- |
| `raw` | `body` for a string / `Buffer`, else `JSON.stringify(body)` | The bytes `rawBody()` returns |
| `contentType` | `text/plain` (string), `application/octet-stream` (`Buffer`), `application/json` (other values); the request's `Content-Type` when `body` is `undefined` | What `useBody().is()` checks against |

To seed bytes and let `parseBody()` parse them like a real request, pass `undefined` as the body: `seedBody(child, undefined, { raw: 'a=1', contentType: 'application/x-www-form-urlencoded' })`.

`seedRawBody(ctx, raw)` from `@wooksjs/event-http` seeds only `useRequest().rawBody()` — use it when the child never uses `@wooksjs/http-body`; otherwise use `seedBody()`, or a parent's already parsed body is read through.

-   **Seed before anything in the child reads the body.** The parent's own body (and its cached `useBody()` / `useRequest()`) is never touched, even if it was already parsed.
-   **Headers are not rewritten.** `useHeaders()['content-type']` / `content-length` and `useRequest().url` still describe the parent request — only the body readers change.

## Custom Body Parser

Use `rawBody` to access the raw body buffer for custom parsing:
```js
import { useBody } from '@wooksjs/http-body';

app.post('test', async () => {
    const { rawBody } = useBody();

    const bodyBuffer = await rawBody();

    // Custom parsing logic for bodyBuffer...
});
```

For reusable parsing logic, create a custom composable with `defineWook` and `cached`:

::: code-group

```ts [custom-parser-composable.ts]
import { useBody } from '@wooksjs/http-body';
import { useHeaders } from '@wooksjs/event-http';
import { defineWook, cached } from '@wooksjs/event-core';

export const useCustomBody = defineWook((ctx) => {
    // Using the `rawBody` composable to get the raw body buffer
    const { rawBody } = useBody(ctx);

    // Preparing default body parser for fallbacks
    const defaultParser = useBody(ctx).parseBody;

    // Getting the content-type
    const { 'content-type': contentType } = useHeaders(ctx);

    // A cached slot ensures parsing happens only once per request
    const parsedSlot = cached(async (ctx) => {
        // Do custom parsing only for 'my-custom-content'
        if (contentType === 'my-custom-content') {
            const bodyBuffer = await rawBody();
            const parsedBody = '...'
            // Your custom parsing logic for bodyBuffer...
            return parsedBody
        } else {
            // Fallback to default parser
            return defaultParser();
        }
    });

    return {
        parseBody: () => ctx.get(parsedSlot),
        rawBody,
    };
});
```

```ts [index.ts]
import { useCustomBody } from './custom-parser-composable';

app.post('test', async () => {
    const { parseBody } = useCustomBody();
    console.log(await parseBody());
});
```

:::

`defineWook` runs the factory once per request. The `cached` slot ensures parsing happens only once even if `parseBody` is called multiple times. See [Custom Composables](/webapp/more-hooks) for more examples.
