# @wooksjs/event-cli -- CLI adapter reference

## Contents

- [App Setup](#app-setup) — `createCliApp`, `TWooksCliOptions`
- [Command Routing](#command-routing) — `app.cli`, parametric paths
- [Running and Response Handling](#running-and-response-handling) — `app.run`, return type → stdout mapping
- [Command Metadata](#command-metadata) — `TWooksCliEntry`, `TCliOption`, `TCliExample`
- [Composables](#composables) — `useCliOptions`, `useCliOption`, `useCliHelp`, `useAutoHelp`, `useCommandLookupHelp`
- [Patterns](#patterns) — auto-help, boolean/value flags, shared CLI+HTTP router
- [Rules & Gotchas](#rules--gotchas)
- [Event Kind Slots](#event-kind-slots)

## App Setup

### `createCliApp(opts?, wooks?): WooksCli`

Create a CLI application instance. Optionally attach to an existing `Wooks` or adapter instance (for shared routing with HTTP).

```ts
import { createCliApp } from '@wooksjs/event-cli'

const app = createCliApp()
```

**`TWooksCliOptions` fields:**

| Option             | Type                                  | Description                                               |
| ------------------ | ------------------------------------- | --------------------------------------------------------- |
| `logger`           | `TConsoleBase`                        | Custom logger instance                                    |
| `onError`          | `(e: Error) => void`                  | Custom error handler (default: print + `process.exit(1)`) |
| `onNotFound`       | `TWooksHandler`                       | Handler invoked when no route matches                     |
| `onUnknownCommand` | `(params: string[], raiseError: () => void) => unknown` | Callback before "unknown command" error    |
| `cliHelp`          | `TCliHelpRenderer \| TCliHelpOptions` | Help renderer instance or help options                    |
| `router`           | `TWooksOptions['router']`             | Custom router configuration                               |
| `eventOptions`     | `EventContextOptions`                 | Options passed to event context creation                  |

Second argument `wooks` accepts a `Wooks` or `WooksAdapterBase` instance to share routing with another adapter (e.g., HTTP).

---

## Command Routing

### `app.cli(path, handler | options)`

Register a CLI command. Return type is the router path handle.

```ts
app.cli<ResType, ParamsType>(
  path: string,
  _options: TWooksCliEntry<ResType> | TWooksHandler<ResType>,
)
```

**Path syntax** uses `@prostojs/router`. Segments separated by `/` or space (equivalent):

```ts
app.cli('deploy staging', handler)
app.cli('deploy/staging', handler)   // identical
```

**Parametric routes:**

```ts
// Required parameter
app.cli('build/:target', handler)        // $ mycli build production

// Optional parameter
app.cli('test/:suite?', handler)         // $ mycli test        (suite = undefined)
                                         // $ mycli test unit   (suite = 'unit')

// Multiple parameters
app.cli('generate/:type/:name', handler) // $ mycli generate component Header
```

**Route params** accessed via `useRouteParams()`:

```ts
import { useRouteParams } from '@wooksjs/event-cli'

app.cli('generate/:type/:name', () => {
  const { params } = useRouteParams<{ type: string; name: string }>()
  return `Generating ${params.type}: ${params.name}`
})
```

> `useRouteParams` and `useLogger` are re-exported from `@wooksjs/event-core`.

---

## Running and Response Handling

### `app.run(argv?, minimistOpts?): Promise<unknown>`

Start command processing. Defaults to `process.argv.slice(2)`.

```ts
await app.run()                                        // process.argv
await app.run(['build', 'production', '--verbose'])    // override argv
await app.run(['cmd', '-cA'], { boolean: ['A'] })      // with minimist options
```

Returns the handler's return value, or an `Error` on failure.

Internally, `run()` creates a CLI `EventContext` via `AsyncLocalStorage`, parses flags with `minimist`, resolves the route, and calls the handler.

### Response handling table

| Return type | Behavior                                          |
| ----------- | ------------------------------------------------- |
| `string`    | `console.log(value)`                              |
| `array`     | Each item logged (strings as-is, objects as JSON) |
| `object`    | `console.log(JSON.stringify(value, null, '  '))`  |
| `Error`     | Passed to `onError` handler                       |
| `undefined` | Nothing printed                                   |

---

## Command Metadata

### `TWooksCliEntry<T>`

Pass as the second argument to `app.cli()` instead of a bare handler to attach help metadata.

| Field         | Type                                                        | Description                                              |
| ------------- | ----------------------------------------------------------- | -------------------------------------------------------- |
| `handler`     | `TWooksHandler<T>`                                          | The command handler function (required)                  |
| `description` | `string`                                                    | Command description for help output                      |
| `args`        | `Record<string, string>`                                    | Argument descriptions (auto-populated from route params) |
| `options`     | `TCliOption[]`                                              | Flag/option definitions                                  |
| `aliases`     | `string[]`                                                  | Alternative command names                                |
| `examples`    | `TCliExample[]`                                             | Usage examples shown in help                             |
| `onRegister`  | `(path: string, aliasType: number, route?) => void`         | Callback when command/alias is registered                |

`aliasType` values: 0 = direct command, 1 = direct alias, 2 = computed alias, 3 = computed alias from `cliHelp`.

### Option definition (`TCliOption`)

```ts
{ keys: ['verbose', 'v'], description: 'Enable verbose output' }            // boolean flag
{ keys: ['config', 'c'], description: 'Config file path', value: 'file' }   // value flag
```

- `keys` -- array of flag names; first is primary, rest are aliases
- `description` -- help text for the flag
- `value` -- if present, the option expects a value; shown in help as `--config <file>`

### Example definition (`TCliExample`)

```ts
{
  description: 'Deploy to production with verbose output',
  cmd: 'production --verbose',
}
```

---

## Composables

### `useCliOptions(): Record<string, boolean | string>`

Return all parsed CLI flags from `minimist`. Positional args are in the `_` property.

```ts
import { useCliOptions } from '@wooksjs/event-cli'

app.cli('build', () => {
  const opts = useCliOptions()
  // $ mycli build --verbose --target=production
  // opts = { _: ['build'], verbose: true, target: 'production' }
})
```

### `useCliOption(name: string): boolean | string | undefined`

Return a single option value. Resolves aliases from the command's option definitions automatically.

```ts
import { useCliOption } from '@wooksjs/event-cli'

app.cli('deploy', {
  options: [{ keys: ['verbose', 'v'], description: 'Verbose output' }],
  handler: () => {
    const verbose = useCliOption('verbose')
    // Returns true for both --verbose and -v
  },
})
```

Internally: looks up the option definition by name, iterates all keys in the definition, and returns the first truthy value from the parsed flags. Falls back to raw `useCliOptions()[name]` if no definition found or on error.

### `useCliHelp()`

Access the help renderer for the current command context.

```ts
import { useCliHelp } from '@wooksjs/event-cli'

const { print, render, getEntry, getCliHelp } = useCliHelp()
```

| Method                        | Return type            | Description                                |
| ----------------------------- | ---------------------- | ------------------------------------------ |
| `print(withColors?: boolean)` | `void`                 | Print help to stdout                       |
| `render(width?, withColors?)` | `string`               | Render help as string                      |
| `getEntry()`                  | `TCliEntry`            | Get the help entry for the current command |
| `getCliHelp()`                | `CliHelpRenderer`      | Get the full `CliHelpRenderer` instance    |

### `useAutoHelp(keys?, colors?): boolean | undefined`

Check if `--help` (or custom flag) was passed. If so, print help and return `true`. Otherwise return `undefined`.

```ts
import { useAutoHelp } from '@wooksjs/event-cli'

app.cli('build', {
  description: 'Build the project',
  handler: () => {
    if (useAutoHelp()) return       // prints help for --help
    return 'Building...'
  },
})
```

**Parameters:**

- `keys` (default: `['help']`) -- option names that trigger help
- `colors` (default: `true`) -- use ANSI colors in output

Custom trigger flags:

```ts
if (useAutoHelp(['help', 'h'], false)) return  // -h or --help, no colors
```

### `useCommandLookupHelp(lookupDepth?: number): void`

Provide "did you mean?" suggestions for unknown commands. Throws an error with suggestions if a partial match is found. Best used in `onUnknownCommand`.

```ts
import { createCliApp, useCommandLookupHelp } from '@wooksjs/event-cli'

const app = createCliApp({
  onUnknownCommand: (params, raiseError) => {
    useCommandLookupHelp()  // throws with suggestions if found
    raiseError()            // fallback: standard "unknown command" error
  },
})
```

**Lookup strategy** for command `run test:drive dir`:

1. `run test:drive dir` (depth 0)
2. `run test:drive` (depth 1)
3. `run test` (depth 2)
4. `run` (depth 3)

If a match has children, suggest them. If a match expects args, report which args are expected. Shows up to 7 suggestions. Default `lookupDepth` is 3.

---

## Patterns

### Auto-help with exit

```ts
app.cli('serve', {
  description: 'Start the development server',
  options: [{ keys: ['port', 'p'], description: 'Port number', value: 'number' }],
  handler: () => {
    if (useAutoHelp()) process.exit(0)
    const port = useCliOption('port') || '3000'
    return `Server running on port ${port}`
  },
})
```

### Boolean vs value flags

- Omit `value` for boolean flags: `useCliOption('watch')` returns `true | undefined`
- Include `value` for value flags: `useCliOption('output')` returns `string | undefined`

### Shared CLI and HTTP router

Both adapters can share the same `Wooks` instance:

```ts
import { createCliApp } from '@wooksjs/event-cli'
import { createHttpApp } from '@wooksjs/event-http'

const httpApp = createHttpApp()
const cliApp = createCliApp({}, httpApp)

// CLI commands and HTTP routes share the same router
cliApp.cli('start', () => httpApp.listen(3000))
```

---

## Rules & Gotchas

- `app.run()` is async — `await` it.
- Default error handling `process.exit(1)` — override `onError` for tests.
- Use `useRouteParams()` for positional args, `useCliOptions()`/`useCliOption()` for flags.
- `useCliOption(name)` resolves aliases from the command's `options` definitions; `useCliOptions()[name]` does NOT.
- `useCliOptions()` is raw minimist output (`_` = positional args, rest = flags).
- `useAutoHelp()` returns `true` when help was printed, else `undefined` (not `false`).
- `useCommandLookupHelp()` **throws** on match — wrap in try/catch if you need fallback beyond `raiseError()`.
- Escape colons in command paths: `app.cli('use\\:dev', handler)` matches `$ mycli use:dev`.
- Command paths accept space or `/` as segment separator — equivalent.
- Prefer options-object form of `app.cli()` — enables auto-help; required `description`/`options` for production CLIs.
- Add `useAutoHelp()` at the top of every handler.

---

## Event Kind Slots

The CLI adapter defines these context slots via `defineEventKind('CLI', ...)`:

| Slot         | Type                       | Description                       |
| ------------ | -------------------------- | --------------------------------- |
| `argv`       | `string[]`                 | Raw argv array                    |
| `pathParams` | `string[]`                 | Positional command segments       |
| `command`    | `string`                   | Resolved command string           |
| `opts`       | `minimist.Opts \| undefined` | Minimist parse options          |
| `cliHelp`    | `TCliHelpRenderer`         | Help renderer instance            |

Internal flag storage uses `key<Record<string, boolean | string>>('cli.flags')`.

## Re-exports

`useRouteParams` and `useLogger` are re-exported from `@wooksjs/event-core`. Refer to the event-core reference for their API.

Also re-exports `EventContext` and `EventContextOptions` types from `@wooksjs/event-core`.
