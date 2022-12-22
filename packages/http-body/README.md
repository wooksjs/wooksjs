# Wooks Body

**!!! This is work-in-progress library, breaking changes are expected !!!**

<p align="center">
<img src="../../wooks-logo.png" width="450px" style="width: 100%; max-width: 450px"><br>
<a  href="https://github.com/wooksjs/wooksjs/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" />
</a>
</p>


Wooks Body is composable body parser for [@wooksjs/event-http](https://github.com/wooksjs/wooksjs/tree/main/packages/event-http).

Supported content types:

- ✅ application/json
- ✅ text/*
- ✅ multipart/form-data
- ✅ application/x-www-form-urlencoded

Body parser does not parse every request's body. The parsing happens only when you call `parseBody` function.

## Install

`npm install @wooksjs/http-body`

## Usage

```ts
import { useBody } from '@wooksjs/http-body'
app.post('test', async () => {
    const { parseBody } = useBody()
    const data = await parseBody()
})
```

### Additional hooks
```ts
import { useBody } from '@wooksjs/http-body'
app.post('test', async () => {
    const {
        isJson, // checks if content-type is "application/json" : () => boolean;
        isHtml, // checks if content-type is "text/html" : () => boolean;
        isXml, // checks if content-type is "application/xml" : () => boolean;
        isText, // checks if content-type is "text/plain" : () => boolean;
        isBinary, // checks if content-type is binary : () => boolean;
        isFormData, // checks if content-type is "multipart/form-data" : () => boolean;
        isUrlencoded, // checks if content-type is "application/x-www-form-urlencoded" : () => boolean;
        isCompressed, // checks content-encoding : () => boolean | undefined;
        contentEncodings, // returns an array of encodings : () => string[];
        parseBody, // parses body according to content-type : <T = unknown>() => Promise<T>;
        rawBody, // returns raw body Buffer : () => Promise<Buffer>;
    } = useBody()

    // the handler got the control, but the body isn't loaded yet
    //...

    console.log(await parseBody())

    // after `await parseBody()` the body was loaded and parsed
    // ...
})
```