# Serve Static

Wooks Serve File is composable static file server for [@wooksjs/event-http](https://github.com/wooksjs/wooksjs/tree/main/packages/event-http).

`serveFile` returns a readable stream and prepares all the neccessary response headers (like content-length, content-type etc).

- ✅ returns a readable stream
- ✅ prepares all the neccessary response headers (like content-length, content-type etc)
- ✅ can handle etag
- ✅ can handle ranges

## Install

```bash
npm install @wooksjs/http-static
```

## Usage


```js
import { serveFile } from '@wooksjs/http-static'
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
import { useRouteParams } from 'wooks'
import { serveFile } from '@wooksjs/http-static'
app.get('static/*', () => {
    const { get } = useRouteParams()
    return serveFile(get('*'), { cacheControl: { maxAge: '10m' } })
})
```

`cacheControl` here is the same object as used in `useSetCacheControl().setCacheControl({ ... })` from `wooks`
