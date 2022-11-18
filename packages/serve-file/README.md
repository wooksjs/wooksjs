# Wooks Serve File

**!!! This is work-in-progress library, breaking changes are expected !!!**

<p align="center">
<img src="../../logo.png" width="128px"><br>
<a  href="https://github.com/prostojs/wooks/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" />
</a>
</p>


Wooks Serve File is composable static file server for Wooks Composables.

`serveFile` returns a readable stream and prepares all the neccessary response headers (like content-length, content-type etc).

- ✅ returns a readable stream
- ✅ prepares all the neccessary response headers (like content-length, content-type etc)
- ✅ can handle etag
- ✅ can handle ranges

## Install

`npm install @wooksjs/serve-file`

## Usage


```js
import { serveFile } from '@wooksjs/serve-file'
// ...
serveFile(filePath, options)
```

**serveFile options**
```ts
{
    // Any header to add
    headers?: Record<string, string>,

    // Cache-Control header
    cacheControl?: TCacheControl,

    // Expires header
    expires?: Date | string | number,

    // when true a header "Pragma: no-cache" will be added
    pragmaNoCache?: boolean,

    // the base directory path
    baseDir?: string,

    // default extension will be added to the filePath
    defaultExt?: string,

    // when true lists files in directory
    listDirectory?: boolean,
    
    // put 'index.html'
    // to automatically serve it from the folder    
    index?: string,           
}
```

### Built-in file server example:

```js
import { useRouteParams } from '@wooksjs/composables'
import { serveFile } from '@wooksjs/serve-file'
app.get('static/*', () => {
    const { getRouteParam } = useRouteParams()
    return serveFile(getRouteParam('*'), { cacheControl: { maxAge: '10m' } })
})
```

`cacheControl` here is the same object as used in `useSetCacheControl().setCacheControl({ ... })` from `@wooksjs/composables`

