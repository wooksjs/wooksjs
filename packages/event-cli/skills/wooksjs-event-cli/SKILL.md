---
name: wooksjs-event-cli
description: Wooks CLI framework — composable, command-line application framework for Node.js. Load when building CLI apps with wooks; defining CLI commands or using the wooks router for command routing; using CLI composables (useCliOptions, useCliOption, useCliHelp, useAutoHelp, useCommandLookupHelp, useRouteParams); creating custom event context composables; working with @wooksjs/event-core context store (init, get, set, hook); parsing CLI flags and options; generating command help and usage text; handling unknown commands; building multi-command CLI tools.
---

# @wooksjs/event-cli

A composable CLI framework for Node.js built on async context (AsyncLocalStorage). Instead of imperative argument parsing libraries, you call composable functions (`useCliOptions()`, `useCliHelp()`, etc.) anywhere in your command handler — flags are parsed on demand and cached per invocation.

## How to use this skill

Read the domain file that matches the task. Do not load all files — only what you need.

| Domain | File | Load when... |
|--------|------|------------|
| Event context (core machinery) | [event-core.md](event-core.md) | Understanding the context store API (`init`/`get`/`set`/`hook`), creating custom composables, lazy evaluation and caching, building your own `use*()` functions |
| CLI app setup | [core.md](core.md) | Creating a CLI app, running commands, `createCliApp`, `app.run()`, error handling, unknown command handling, sharing routers, testing |
| Commands & help | [commands.md](commands.md) | Defining commands with `app.cli()`, command syntax (args, aliases, options, examples), help generation (`useCliHelp`, `useAutoHelp`, `useCommandLookupHelp`), accessing flags (`useCliOptions`, `useCliOption`), route params in CLI |

## Quick reference

```ts
import { useRouteParams } from '@wooksjs/event-core'
import { createCliApp, useCliOptions } from '@wooksjs/event-cli'

const app = createCliApp()
app.cli('greet/:name', () => {
  const { get } = useRouteParams<{ name: string }>()
  const flags = useCliOptions()
  return `Hello, ${get('name')}!`
})
app.run()
```

Key composables: `useCliOptions()`, `useCliOption(name)`, `useCliHelp()`, `useAutoHelp()`, `useCommandLookupHelp()`, `useRouteParams()`, `useEventId()`, `useEventLogger()`.
