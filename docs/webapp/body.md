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
The `useBody` function provides a `contentIs(type)` checker and access to the raw body buffer.

Example:

```js
import { useBody } from '@wooksjs/http-body';

app.post('test', async () => {
    const {
        contentIs, // checks the content type : (type) => boolean
        parseBody, // parses the body according to the content type : <T = unknown>() => Promise<T>;
        rawBody, // returns the raw body buffer : () => Promise<Buffer>;
    } = useBody();

    // Short names: 'json', 'html', 'xml', 'text', 'binary', 'form-data', 'urlencoded'
    // Or full MIME types: 'application/msgpack', 'image/png', etc.
    if (contentIs('json')) {
        console.log(await parseBody());
    }
});
```

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
