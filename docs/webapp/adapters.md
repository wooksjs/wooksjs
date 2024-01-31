# Create an Adapter

This guide is for those who want to create their own adapter and gain more control over Wooks.
By creating an adapter, you can use your own router and handler processing while still benefiting from Wooks composables.
This technique can be used to write Wooks adapters for other web app frameworks.

## Create a new Wooks HTTP Context

The Wooks HTTP Context is a special object that stores various information related to the request and response handling process.
To create a new Wooks HTTP Context, you can use the `createHttpContext` function.

```ts
import { createHttpContext } from '@wooksjs/event-http'

function requestHandler(req, res) {
  const { restoreCtx, clearCtx, store } = createHttpContext({
    req, // instance of the request
    res, // instance of the response
  })

  // Use the created Wooks HTTP Context
  // ...
}
```

In the above example, the `createHttpContext` function is used to create a new Wooks HTTP Context.
The function takes an object with the req (instance of the request) and res (instance of the response) properties.
It returns an object with `restoreCtx`, `clearCtx`, and `store` properties.

The `restoreCtx` function is used to restore the Wooks context after any asynchronous operation,
while the `clearCtx` function is used to clear the Wooks context when the request processing is complete.
The `store` function allows you to access the Wooks store of the current context.

## Create a responder

A responder is a function that takes the output of the request handler and transforms it into an HTTP response,
processing headers, cookies, and formats. To create a responder, you can use the `createWooksResponder` function.

```ts
import { createWooksResponder, createHttpContext } from '@wooksjs/event-http'

const { createResponse, respond } = createWooksResponder()

async function requestHandler(req, res) {
  const { restoreCtx, clearCtx } = createHttpContext({ req, res })

  // Process the request and get the output
  const response = await processHandlers()

  // Restore the Wooks context
  restoreCtx()

  // Respond to the request
  respond(response)

  // Clear the Wooks context
  clearCtx()
}

async function processHandlers() {
  // Routing, processing, handling, ...
}
```

In the above example, the `createWooksResponder` function is used to create a responder.
It returns an object with `createResponse` and `respond` functions.
The `createResponse` function is used to create a Wooks response object,
while the respond function is used to send the response based on the output of the request handler.

## Use it with HTTP server of your choise

Once you have created the request handler and the responder, you can use them with the HTTP server of your choice.
Here's an example using the http module.

```ts
import http from 'http' // [!code ++]
import { createWooksResponder, createHttpContext } from '@wooksjs/event-http'

const { createResponse, respond } = createWooksResponder()

async function requestHandler(req, res) {
  const { restoreCtx, clearCtx } = createHttpContext({ req, res })

  // Process the request and get the output
  const response = await processHandlers()

  // Restore the Wooks context
  restoreCtx()

  // Respond to the request
  respond(response)

  // Clear the Wooks context
  clearCtx()
}

async function processHandlers() {
  // Routing, processing, handling, ...
}

const server = http.createServer(requestHandler) // [!code ++]
server.listen(3000, () => {
  // [!code ++]
  console.log('Wooks Server is up on port 3000') // [!code ++]
}) // [!code ++]
```

In the above example, the `requestHandler` function is used as the request listener for the HTTP server.
Inside the `requestHandler`, the Wooks HTTP Context is created, the request is processed, and the response is sent using the responder.

By using this approach, you can integrate Wooks into your preferred HTTP server and have more control over the request handling process while leveraging the power of Wooks composables.
