# Getting Started

## Overview

Wooks (Web-Hooks) is an event processing framework. The major functionality is
of course http events. Nevertheless you can build CLI with the similar approach.
And even more event types support is coming.

The main ideas are:
- each event has its context (state)
- composable functions (hooks) can parse/fetch data and cache the result in the event context
- the context is available within the handlers via hooks to the context

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