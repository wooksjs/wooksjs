# Express Adapter

If you want to use Wooks with your existing project that is built with Express,
you can utilize the Express Adapter for Wooks HTTP. This adapter allows you to seamlessly integrate Wooks into your Express application.

See on [github](https://github.com/wooksjs/express-adapter/).

## Get Express in Wooks

To use the Express Adapter, you need to install the `@wooksjs/express-adapter` package along with the `@wooksjs/event-http` package.

```bash
npm install @wooksjs/express-adapter @wooksjs/event-http
```

There are two options to use express with wooks

## Option #1. Adapter for express API:

The Express Adapter provides an option to modify the Express API methods (`get`, `post`, etc.)
so that you can continue using the familiar Express app API while incorporating Wooks functionalities.

Here's an example of how to use the Express Adapter with modified Express methods:

```ts
import express from 'express'
import { applyExpressAdapter } from '@wooksjs/express-adapter'
import { useBody } from '@wooksjs/http-body'
import { HttpError } from '@wooksjs/event-http'
import { useRouteParams } from '@wooksjs/event-core'

const app = express()
applyExpressAdapter(app)

app.get('/test/:param', () => {
  const { get } = useRouteParams()
  return { message: 'it works', param: get('param') }
})

app.post('/post', () => {
  const { parseBody } = useBody()
  return parseBody()
})

app.get('/error', () => {
  throw new HttpError(400, 'test error')
})

app.listen(3000, () => console.log('Listening on port 3000'))
```

In the above example, the `applyExpressAdapter` function is used to apply the Express Adapter to the app object. This modifies the Express methods (`get`, `post`, etc.) to work with Wooks.

## Option #2. Adapter for WooksHttp API:

If you prefer to use the Wooks app API instead of modifying the Express methods, you can use the Express Adapter
as middleware and route requests through Wooks. This option allows you to use the Wooks app API and is compatible with `@moostjs/event-http`.

Here's an example of how to use the Express Adapter with the WooksHttp API:

```ts
import express from 'express'
import { WooksExpress } from '@wooksjs/express-adapter'
import { useBody } from '@wooksjs/http-body'
import { HttpError } from '@wooksjs/event-http'
import { useRouteParams } from '@wooksjs/event-core'

const expressApp = Express()
const wooksApp = new WooksExpress(expressApp, { raise404: true })

wooksApp.get('/test/:param', () => {
  const { get } = useRouteParams()
  return { message: 'it works', param: get('param') }
})

wooksApp.post('/post', () => {
  const { parseBody } = useBody()
  return parseBody()
})

wooksApp.get('/error', () => {
  throw new HttpError(400, 'test error')
})

wooksApp.listen(3000, () => console.log('listening 3000'))
```

In this example, the `WooksExpress` class is used to create a Wooks adapter for Express.
The Wooks adapter is then used to define routes and handle requests using Wooks composables.

Choose the option that best suits your project requirements and integrate Wooks into your Express application effortlessly with the Express Adapter for Wooks HTTP.
