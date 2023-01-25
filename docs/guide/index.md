# Getting Started

::: warning
The work on Wooks is still in progress. It is already suitable for
out-of-the-box use for HTTP events, but some of the APIs can still change.
:::

## Your First Wooks Project

In this guide we start with http event processing.

First install the npm dependencies:

```bash
npm i wooks @wooksjs/event-http
```

Now create `index.js` and you can get your first wooks web app working:

```js
import { useRouteParams } from 'wooks'
import { createHttpApp } from '@wooksjs/event-http'

const app = createHttpApp()

app.on('GET', 'hello/:name', () => `Hello ${ useRouteParams().get('name') }!`)

// shortcuts for some methods are supported:
// app.get('hello/:name', () => `Hello ${ useRouteParams().get('name') }!`)

app.listen(3000, () => { console.log('Wooks Server is up on port 3000') })
```