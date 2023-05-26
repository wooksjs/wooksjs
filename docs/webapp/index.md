# Quick Start a Web App

::: warning
Work on Wooks is still in progress. It is already suitable for immediate use in HTTP events,
but some APIs may still undergo changes.
:::

[[toc]]

## Installation

```bash
npm install wooks @wooksjs/event-http
```

## Your Wooks Web App

Here's a `Hello World` example app. It spins up a server on port 3000 and replies `Hello World!`.

::: code-group

```js [ESM]
import { useRouteParams } from 'wooks'
import { createHttpApp } from '@wooksjs/event-http'

const app = createHttpApp()

app.on('GET', 'hello/:name', () => `Hello ${useRouteParams().get('name')}!`)

// or use a shortcut for the get method:
// app.get('hello/:name', () => `Hello ${ useRouteParams().get('name') }!`)

app.listen(3000, () => {
    app.getLogger('App').log('Wooks Server is up on port 3000')
})
```

```js [CommonJS]
const { useRouteParams } = require('wooks')
const { createHttpApp } = require('@wooksjs/event-http')

const app = createHttpApp()

app.on('GET', 'hello/:name', () => `Hello ${useRouteParams().get('name')}!`)

// or use a shortcut for the get method:
// app.get('hello/:name', () => `Hello ${ useRouteParams().get('name') }!`)

app.listen(3000, () => {
    app.getLogger('App').log('Wooks Server is up on port 3000')
})
```

:::

Call the endpoint to see the result:

```bash
curl http://localhost:3000/hello/World
# Hello World!
```

## Use `http` directly

You can create http(s) server manually and pass the server callback from the Wooks HTTP app.

::: code-group

```js [ESM]
import { useRouteParams } from 'wooks'
import { createHttpApp } from '@wooksjs/event-http'
import http from 'http'  // [!code ++]

const app = createHttpApp()

app.get('hello/:name', () => `Hello ${useRouteParams().get('name')}!`)

const server = http.createServer(app.getServerCb()) // [!code ++]
server.listen(3000, () => { // [!code ++]
app.listen(3000, () => {    // [!code --]
    console.log('Wooks Server is up on port 3000')
}) 
```

```js [CommonJS]
const { useRouteParams } = require('wooks')
const { createHttpApp } = require('@wooksjs/event-http')
const http = require('http') // [!code ++]

const app = createHttpApp()

app.get('hello/:name', () => `Hello ${useRouteParams().get('name')}!`)

const server = http.createServer(app.getServerCb()) // [!code ++]
server.listen(3000, () => { // [!code ++]
app.listen(3000, () => {    // [!code --]
    console.log('Wooks Server is up on port 3000')
})
```
:::

## What's next?

-  Explore [Routing capabilities](/webapp/routing)
-  Find out how to use [Request Composables](/webapp/composables/request)
-  Learn how to work with [Response](/webapp/composables/response)