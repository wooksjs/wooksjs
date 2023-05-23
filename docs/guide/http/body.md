# Body Parser

The body parser in WooksJS allows you to parse the request body based on its `Content-Type`.
Whether it's plain text, JSON, images, or other types of data, the body parser handles the parsing process for you.
The parsed body is then cached in the Wooks Context, ensuring that the parsing happens only once,
even if you call the `parseBody` function multiple times in different parts of your code.

Supported content types:

-   `application/json`
-   `text/*`
-   `multipart/form-data`
-   `application/x-www-form-urlencoded`

Body parser does not parse every request's body. The parsing happens only when you call `parseBody` function.

## Installation

To use the body parser in your WooksJS project, you need to install the `@wooksjs/http-body` package:

```bash
npm install @wooksjs/http-body
```

## Usage

Once installed, you can import and use the `useBody` composable function in your WooksJS application.

Example:
```js
import { useBody } from '@wooksjs/http-body'

app.post('test', async () => {
    const { parseBody } = useBody()
    const data = await parseBody()
})
```
The `useBody` function provides additional hooks for checking the content type and accessing the raw body buffer.

Example:

```js
import { useBody } from '@wooksjs/http-body';

app.post('test', async () => {
    const {
        isJson, // checks if the content type is "application/json" : () => boolean;
        isHtml, // checks if the content type is "text/html" : () => boolean;
        isXml, // checks if the content type is "application/xml" : () => boolean;
        isText, // checks if the content type is "text/plain" : () => boolean;
        isBinary, // checks if the content type is binary : () => boolean;
        isFormData, // checks if the content type is "multipart/form-data" : () => boolean;
        isUrlencoded, // checks if the content type is "application/x-www-form-urlencoded" : () => boolean;
        isCompressed, // checks the content-encoding : () => boolean | undefined;
        contentEncodings, // returns an array of encodings : () => string[];
        parseBody, // parses the body according to the content type : <T = unknown>() => Promise<T>;
        rawBody, // returns the raw body buffer : () => Promise<Buffer>;
    } = useBody();

    // Your pre-processing logic goes here, the body isn't loaded yet

    console.log(await parseBody());

    // Rest of your handler's code, the body was loaded and parsed
});
```

You can use the `isJson`, `isHtml`, `isXml`, `isText`, `isBinary`, `isFormData`, and `isUrlencoded` getters
to check the content type of the request body.
The `parseBody` function parses the body based on the content type and returns the parsed data.
The `rawBody` function provides access to the raw body buffer.

## Custom Body Parser

If you want to parse the body in a custom way, you can use the
`rawBody` function provided by useBody.
This allows you to access the raw body buffer and implement your own parsing logic.

Example:
```js
import { useBody } from '@wooksjs/http-body';

app.post('test', async () => {
    const { rawBody } = useBody();

    const bodyBuffer = await rawBody();

    // Custom parsing logic for bodyBuffer...
});
```

However, parsing the body directly in the handler may not be convenient and may result in parsing the body multiple times.
To improve your code, you can create your own body parser composable.

Example:

::: code-group

```ts [custom-parser-composable.ts]
import { useBody, useHttpContext } from '@wooksjs/http-body';

// Describing the type of the context store
type TBodyStore = {
    parsed?: Promise<unknown>;
};

export function useCustomBody() {
    // Getting the context store for our type
    const { store } = useHttpContext<{ request: TBodyStore }>();

    // Getting the init function for `request` props
    const { init } = store('request');

    // Using the `rawBody` composable to get the raw body buffer
    const { rawBody } = useBody();

    // Preparing default body parser for fallbacks
    const defaultParser = useBody().parseBody;

    // Getting the content-type
    const { 'content-type': contentType } = useHeaders();

    // Defining our parser
    const parseBody = () =>
        init('parsed', async () => {
            // Do custom parsing only for 'my-custom-content'
            if (contentType === 'my-custom-content') {
                const bodyBuffer = await rawBody();
                const parcedBody = '...'
                // Your custom parsing logic for bodyBuffer...
                return parcedBody
            } else {
                // Fallback to default parser
                return defaultParser();
            }
        });

    return { parseBody, rawBody };
}
```

```ts [index.ts]
import { useCustomBody } from './custom-parser-composable';

app.post('test', async () => {
    const { parseBody } = useCustomBody();
    console.log(await parseBody());
});
```

:::

In the example above, we created a custom composable function called `useCustomBody`
that parses the body for content type `'my-custom-content'` and falls back to the default
parser provided by `@wooksjs/http-body` for other content types.

With the this approach, you can easily customize the body parsing logic based on your specific requirements.

Please note that `store` and `init` functions that we used above are part of the Event Context API.
For more details on using Wooks Event Context API, refer to the [Event Context](../advanced/context.md).
