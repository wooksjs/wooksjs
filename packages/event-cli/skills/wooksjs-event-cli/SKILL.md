---
name: wooksjs-event-cli
description: Use this skill when working with @wooksjs/event-cli — to build CLI applications with createCliApp(), register commands with app.cli(), parse flags and options with useCliOptions()/useCliOption(), generate auto-help with useCliHelp()/useAutoHelp(), handle unknown commands with useCommandLookupHelp(), define command aliases/args/options metadata, or run CLI commands programmatically with app.run().
---

# @wooksjs/event-cli

CLI adapter for Wooks. Build command-line applications with the same composable architecture as Wooks HTTP — routed commands, typed options, auto-generated help, and per-invocation context.

## How to use this skill

Read the domain file that matches the task. Do not load all files — only what you need.

| Domain               | File                       | Load when...                                                                                                                |
| -------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Core setup & routing | [core.md](core.md)         | Creating a CLI app, registering commands, running commands, understanding the architecture                                  |
| Commands & help      | [commands.md](commands.md) | Command registration with options/args/aliases, help generation, composables (`useCliOptions`, `useCliHelp`, `useAutoHelp`) |

## Quick reference

```ts
import { createCliApp } from '@wooksjs/event-cli'
import { useRouteParams, useLogger } from '@wooksjs/event-cli'
import {
  useCliOptions,
  useCliOption,
  useCliHelp,
  useAutoHelp,
  useCommandLookupHelp,
} from '@wooksjs/event-cli'
```
