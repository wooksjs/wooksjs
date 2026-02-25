# Core setup & routing — @wooksjs/event-cli

> Creating a CLI app, registering commands, running them, and architecture overview.

## Concepts

`@wooksjs/event-cli` wraps command-line argument parsing with Wooks' composable architecture. Each command invocation gets its own `EventContext`, and handlers are plain functions. Command routing uses the same `@prostojs/router` as the HTTP adapter — supporting parameters, optional params, wildcards, and aliases.

Arguments are parsed with `minimist`. Help text is generated automatically from command metadata via `@prostojs/cli-help`.

## Installation

```bash
pnpm add @wooksjs/event-cli
```

Peer dependencies: `@wooksjs/event-core`, `wooks`, `@prostojs/router`, `@prostojs/logger`.

## API Reference

### `createCliApp(opts?): WooksCli`

Creates a CLI application instance.

```ts
import { createCliApp } from '@wooksjs/event-cli'

const app = createCliApp()

app.cli('greet/:name', () => {
  const { params } = useRouteParams<{ name: string }>()
  return `Hello, ${params.name}!`
})

app.run() // processes process.argv
```

**Options (`TWooksCliOptions`):**

| Option             | Type                                  | Description                                               |
| ------------------ | ------------------------------------- | --------------------------------------------------------- |
| `logger`           | `TConsoleBase`                        | Custom logger                                             |
| `onError`          | `(e: Error) => void`                  | Custom error handler (default: print + `process.exit(1)`) |
| `onNotFound`       | `TWooksHandler`                       | Handler for unknown commands                              |
| `onUnknownCommand` | `(params, raiseError) => unknown`     | Callback before "unknown command" error                   |
| `cliHelp`          | `TCliHelpRenderer \| TCliHelpOptions` | Help renderer or options                                  |
| `router`           | router options                        | Custom router configuration                               |

### `app.cli(path, handler | options)`

Register a CLI command. Path segments can use `/` or space as separators.

```ts
// Simple handler
app.cli('build/:target', () => {
  const { params } = useRouteParams<{ target: string }>()
  return `Building ${params.target}...`
})

// Equivalent paths:
app.cli('deploy staging', handler)
app.cli('deploy/staging', handler)
```

### `app.run(argv?, minimistOpts?)`

Start command processing. Defaults to `process.argv.slice(2)`.

```ts
// Use process.argv
await app.run()

// Override argv
await app.run(['build', 'production', '--verbose'])

// With minimist options
await app.run(['cmd', '-cA'], { boolean: ['A'] })
```

Returns the handler's return value, or an `Error` if the command fails.

## Command routing

Routes use the same `@prostojs/router` as HTTP. Command path segments become route segments:

```ts
// Static command
app.cli('init', handler) // $ mycli init

// With parameter
app.cli('build/:target', handler) // $ mycli build production

// Optional parameter
app.cli('test/:suite?', handler) // $ mycli test        (suite = undefined)
// $ mycli test unit   (suite = 'unit')

// Multi-segment
app.cli('deploy staging setup', handler) // $ mycli deploy staging setup
```

Route params accessed via `useRouteParams()`:

```ts
import { useRouteParams } from '@wooksjs/event-cli'

app.cli('generate/:type/:name', () => {
  const { params } = useRouteParams<{ type: string; name: string }>()
  return `Generating ${params.type}: ${params.name}`
})
```

## Response handling

Handler return values are printed to stdout:

| Return type | Behavior                                          |
| ----------- | ------------------------------------------------- |
| `string`    | `console.log(value)`                              |
| `array`     | Each item logged (strings as-is, objects as JSON) |
| `object`    | `console.log(JSON.stringify(value, null, '  '))`  |
| `Error`     | Passed to `onError` handler                       |
| `undefined` | Nothing printed                                   |

## Best Practices

- Use `useRouteParams()` for positional arguments and `useCliOptions()` for flags
- Prefer the options object form of `app.cli()` to get auto-generated help
- Use `onUnknownCommand` with `useCommandLookupHelp()` for "did you mean?" suggestions
- Command paths with spaces and `/` are equivalent — use whichever is more readable

## Gotchas

- `app.run()` is async — always `await` it
- Default error handling calls `process.exit(1)` — override with `onError` for testing
- Colons in command names need escaping: `app.cli('use\\:dev', handler)` for `$ mycli use:dev`
- `minimist` treats `--no-flag` as `flag: false` when the flag is in `boolean` array
