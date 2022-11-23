# @wooksjs/event-cli

**!!! This is work-in-progress library, breaking changes are expected !!!**

<p align="center">
<img src="../../logo.png" width="128px"><br>
<a  href="https://github.com/wooksjs/wooksjs/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" />
</a>
</p>

As a part of `wooks` event processing framework, `@wooksjs/event-cli` implements CLI events and provides composables that let you:

- access flags (- or --)

## Install

`npm install wooks @wooksjs/event-cli`

## Quick Start

```js
import { useRouteParams, Wooks } from 'wooks'
import { WooksCli, cliShortcuts, useFlags } from '@wooksjs/event-cli'

const app = new Wooks().shortcuts(cliShortcuts)

app.cli('test', () => {
    console.log('flags:')
    return useFlags()
})

app.cli(':arg', () => {
    console.log('run argument:', useRouteParams().params)
    return 'done'
})

app.subscribe(new WooksCli())

// node ./index.js test
// node ./index.js random
```
