# Get Started with Web App

::: info
Learn more about Wooks to understand its philosophy and advantages:

- [What is Wooks?](/wooks/what)
- [Why Wooks?](/wooks/why)
- [Comparison with Express, Fastify, and h3](/wooks/comparison)
:::

Or you can get hands-on with the HTTP flavor of Wooks right now.

## Installation

```bash
npm install @wooksjs/event-http
```

This gives you access to the Wooks core library and the HTTP adapter, which provides a simple, Express-like API for creating HTTP servers while leveraging Wooks’ composable and context-driven patterns.

## Creating Your First "Hello World" App

In this example, we’ll create an HTTP server that responds to `GET /hello/:name` with a personalized greeting.

**Example:**  
```js
import { createHttpApp, useRouteParams } from '@wooksjs/event-http'

const app = createHttpApp()

// Register a route handler using the GET method shortcut:
app.get('hello/:name', () => `Hello ${useRouteParams().get('name')}!`)

// Start the server on port 3000
app.listen(3000, () => {
    // Use the built-in logger to print a startup message
    app.getLogger('[App]').log('Wooks Server is up on port 3000')
})
```

**Test It:**
```bash
curl http://localhost:3000/hello/World
# Hello World!
```

## Using Node’s `http` Server Directly

You can create http(s) server manually and pass the server callback from the Wooks HTTP app.
Use `getServerCb()` to plug Wooks into an `http` server of your own.

**Example:**  
```js
import { createHttpApp, useRouteParams } from '@wooksjs/event-http'
import http from 'http'  // [!code ++]

const app = createHttpApp()

app.get('hello/:name', () => `Hello ${useRouteParams().get('name')}!`)

const server = http.createServer(app.getServerCb()) // [!code ++]
server.listen(3000, () => { // [!code ++]
app.listen(3000, () => {    // [!code --]
    console.log('Wooks Server is up on port 3000')
}) 
```

**Test It:**
```bash
curl http://localhost:3000/hello/Wooks
# Hello Wooks!
```

## Next Steps

- **Working with Request:** Check out [Request Composables](/webapp/composables/request) to learn how to manipulate request data, read headers or cookies and more.
- **Add Logging & Error Handling:** Integrate event loggers or custom error-handling composables to make debugging easier.
- **Advance to Other Flavors:** Once comfortable with HTTP, consider exploring CLI or Workflow flavors for broader event-driven architectures.
