# Commands & help — @wooksjs/event-cli

> Command registration with options/args/aliases, help generation, and CLI composables.

## Concepts

Commands can be registered with rich metadata (description, options, args, aliases, examples) that drives auto-generated help output. The help system is powered by `@prostojs/cli-help`.

CLI composables (`useCliOptions`, `useCliOption`, `useCliHelp`, `useAutoHelp`) provide access to parsed flags and help rendering from within handlers.

## API Reference

### Command registration with options

```ts
app.cli('deploy/:env', {
  description: 'Deploy the application to the specified environment',
  args: {
    env: 'Target environment (staging, production)',
  },
  options: [
    { keys: ['verbose', 'v'], description: 'Enable verbose output' },
    { keys: ['dry-run', 'd'], description: 'Run without making changes' },
    { keys: ['config', 'c'], description: 'Path to config file', value: 'path' },
  ],
  aliases: ['dep'],
  examples: [
    {
      description: 'Deploy to production with verbose output',
      cmd: 'production --verbose',
    },
  ],
  handler: () => {
    const { params } = useRouteParams<{ env: string }>()
    const verbose = useCliOption('verbose')
    return `Deploying to ${params.env}${verbose ? ' (verbose)' : ''}`
  },
})
```

**`TWooksCliEntry<T>` fields:**

| Field         | Type                                | Description                                              |
| ------------- | ----------------------------------- | -------------------------------------------------------- |
| `handler`     | `TWooksHandler<T>`                  | The command handler function                             |
| `description` | `string`                            | Command description for help                             |
| `args`        | `Record<string, string>`            | Argument descriptions (auto-populated from route params) |
| `options`     | `TCliOption[]`                      | Flag/option definitions                                  |
| `aliases`     | `string[]`                          | Alternative command names                                |
| `examples`    | `TCliExample[]`                     | Usage examples                                           |
| `onRegister`  | `(path, aliasType, route?) => void` | Callback when command/alias is registered                |

**Option definition:**

```ts
{ keys: ['verbose', 'v'], description: 'Enable verbose output' }
{ keys: ['config', 'c'], description: 'Config file path', value: 'file' }
```

- `keys`: Array of flag names (first is primary, rest are aliases)
- `description`: Help text
- `value`: If present, the option expects a value (shown in help as `--config <file>`)

### `useCliOptions(): Record<string, boolean | string>`

Returns all parsed CLI flags (via `minimist`). Includes positional args in `_`.

```ts
import { useCliOptions } from '@wooksjs/event-cli'

app.cli('build', () => {
  const opts = useCliOptions()
  // For: $ mycli build --verbose --target=production
  // opts = { _: ['build'], verbose: true, target: 'production' }
})
```

### `useCliOption(name: string): boolean | string | undefined`

Returns a single option value, resolving aliases from the command's option definitions.

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

### `useCliHelp()`

Provides access to the help renderer for the current command.

```ts
import { useCliHelp } from '@wooksjs/event-cli'

const { print, render, getEntry, getCliHelp } = useCliHelp()
```

| Method                        | Description                                |
| ----------------------------- | ------------------------------------------ |
| `print(withColors?)`          | Print help to stdout                       |
| `render(width?, withColors?)` | Render help as string                      |
| `getEntry()`                  | Get the help entry for the current command |
| `getCliHelp()`                | Get the full `CliHelpRenderer` instance    |

### `useAutoHelp(keys?, colors?)`

Checks if `--help` (or custom flag) was passed; if so, prints help and returns `true`.

```ts
import { useAutoHelp } from '@wooksjs/event-cli'

app.cli('build', {
  description: 'Build the project',
  handler: () => {
    if (useAutoHelp()) return // prints help and returns true for --help
    return 'Building...'
  },
})

// Custom trigger flags
app.cli('test', {
  handler: () => {
    if (useAutoHelp(['help', 'h'], false)) return // -h, --help, no colors
  },
})
```

**Parameters:**

- `keys` (default: `['help']`) — option names that trigger help
- `colors` (default: `true`) — whether to use ANSI colors

### `useCommandLookupHelp(lookupDepth?)`

Provides "did you mean?" suggestions for unknown commands. Best used in `onUnknownCommand`:

```ts
import { createCliApp } from '@wooksjs/event-cli'
import { useCommandLookupHelp } from '@wooksjs/event-cli'

const app = createCliApp({
  onUnknownCommand: (params, raiseError) => {
    useCommandLookupHelp() // throws with suggestions if found
    raiseError() // fallback: standard "unknown command" error
  },
})
```

For a command like `run test:drive dir`, it searches backwards:

1. `run test:drive dir` (depth 0)
2. `run test:drive` (depth 1)
3. `run test` (depth 2)
4. `run` (depth 3)

If a match has children, it suggests them. If a match expects args, it says which args are expected.

## Common Patterns

### Pattern: Auto-help with exit

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

### Pattern: Boolean and value flags

```ts
app.cli('build', {
  options: [
    { keys: ['watch', 'w'], description: 'Watch mode' }, // boolean
    { keys: ['output', 'o'], description: 'Output dir', value: 'path' }, // value
  ],
  handler: () => {
    const watch = useCliOption('watch') // true | undefined
    const output = useCliOption('output') // 'dist' | undefined
  },
})
```

### Pattern: Shared CLI and HTTP adapters

Both adapters can share the same `Wooks` instance:

```ts
import { createCliApp } from '@wooksjs/event-cli'
import { createHttpApp } from '@wooksjs/event-http'

const httpApp = createHttpApp()
const cliApp = createCliApp({}, httpApp)

// CLI commands and HTTP routes share the same router
cliApp.cli('start', () => httpApp.listen(3000))
```

## Best Practices

- Always provide `description` and `options` for production CLI tools — it powers `--help`
- Use `useAutoHelp()` at the top of every command handler
- Use `useCommandLookupHelp()` in `onUnknownCommand` for better UX
- Use aliases for common abbreviations: `aliases: ['dep']` for `deploy`

## Gotchas

- `useCliOptions()` returns the raw `minimist` output — `_` contains positional args, everything else is flags
- `useCliOption(name)` resolves aliases from the option definitions — `useCliOptions()[name]` does not
- Help is auto-registered from `app.cli()` metadata — no separate help registration needed
- Colons in command names must be escaped: `'use\\:dev'` for command `use:dev`
