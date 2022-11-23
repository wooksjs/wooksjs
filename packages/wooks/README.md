# Wooks

**!!! This is work-in-progress library, breaking changes are expected !!!**

<p align="center">
<img src="../../logo.png" width="128px"><br>
<a  href="https://github.com/wooksjs/wooksjs/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" />
</a>
</p>

Wooks is a Event Processing Framework based on composable (hooks) functions.

`wooks` + `@wooksjs/event-http` = Web Application Framework with hooks.

As an alternative for `express` and `fastify`, `wooks` brings the whole different approach for processing http requests.
It utilizes such a technique as you can see in React Hooks or Vue Composables. It has only a dependency on [@prostojs/router](https://github.com/prostojs/router) (an alternative to `find-my-way` used by `fastify`) which is a very fast (see benchmarks [here](https://github.com/prostojs/router-benchmark)) and robust URI router. 

### HTTP Composables packs:

- [@wooksjs/event-http](https://github.com/wooksjs/wooksjs/tree/main/packages/event-http) - HTTP event package with core functionality
- [@wooksjs/http-body](https://github.com/wooksjs/wooksjs/tree/main/packages/http-body) - to parse body
- [@wooksjs/http-static](https://github.com/wooksjs/wooksjs/tree/main/packages/http-static) - to serve static files
- [@wooksjs/http-proxy](https://github.com/wooksjs/wooksjs/tree/main/packages/http-proxy) - to proxy requests

## Install

`npm install wooks`

## Quick Start with a Web App

`npm install wooks @wooksjs/event-http`

```js
import { Wooks, useRouteParams } from 'wooks'
import { WooksHttp } from '@wooksjs/event-http'

const app = new Wooks()

app.on('GET', 'hello/:name', () => `Hello ${ useRouteParams().get('name') }!`)

app.subscribe(new WooksHttp(3000, () => {
    console.log('Wooks Server is up on port 3000')
}))
```
