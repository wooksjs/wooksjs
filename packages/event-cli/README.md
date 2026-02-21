# @wooksjs/event-cli

**!!! This is work-in-progress library, breaking changes are expected !!!**

<p align="center">
<img src="../../wooks-logo.png" width="450px"><br>
<a  href="https://github.com/wooksjs/wooksjs/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" />
</a>
</p>

As a part of `wooks` event processing framework, `@wooksjs/event-cli` implements CLI events and provides composables that let you:

- access flags (- or --)

## Installation

`npm install wooks @wooksjs/event-cli`

## Quick Start

```js
import { useRouteParams } from 'wooks'
import { createCliApp, useCliOptions } from '@wooksjs/event-cli'

const app = createCliApp()

app.cli('test', () => {
  console.log('options:')
  return useCliOptions()
})

app.cli(':arg', () => {
  console.log('run argument:', useRouteParams().params)
  return 'done'
})

app.run()

// node ./index.js test
// node ./index.js random
```

## Documentation

To check out docs, visit [wooks.moost.org](https://wooks.moost.org/cliapp/).

## AI Agent Skills

This package ships with structured skill files for AI coding agents (Claude Code, Cursor, Windsurf, Codex, etc.).

```bash
# Project-local (recommended — version-locked, commits with your repo)
npx @wooksjs/event-cli setup-skills

# Global (available across all your projects)
npx @wooksjs/event-cli setup-skills --global
```

To keep skills automatically up-to-date, add a postinstall script to your `package.json`:

```json
{
  "scripts": {
    "postinstall": "npx @wooksjs/event-cli setup-skills --postinstall"
  }
}
```

This ensures the skill files are refreshed whenever dependencies are installed, without needing a separate command.
