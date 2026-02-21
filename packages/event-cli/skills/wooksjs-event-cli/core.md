# Core Concepts — @wooksjs/event-cli

> Covers CLI app creation, running commands, how the CLI adapter integrates with the event context system, error handling, unknown command handling, and testing.

For the underlying event context store API (`init`, `get`, `set`, `hook`, etc.) and how to create custom composables, see [event-core.md](event-core.md).

## Mental Model

`@wooksjs/event-cli` is the CLI adapter for Wooks. It turns every CLI invocation into an event with its own isolated context store. Instead of imperative argument parsing, you call composable functions (`useCliOptions()`, `useCliHelp()`, etc.) from anywhere in your command handler — flags and arguments are parsed on demand and cached per invocation.

Key principles:
1. **Commands are routes** — CLI command paths use the same `@prostojs/router` as HTTP routes, with params (`:name`), optional segments (`:arg?`), and wildcards.
2. **Flags are composable** — Call `useCliOptions()` or `useCliOption('verbose')` from anywhere in the handler chain to get parsed flags.
3. **Built-in help generation** — Register descriptions, options, args, examples, and aliases alongside your commands. The framework generates formatted help text.

## Installation

```bash
npm install wooks @wooksjs/event-cli
```

## Creating a CLI App

```ts
import { createCliApp } from '@wooksjs/event-cli'

const app = createCliApp()

app.cli('hello', () => 'Hello World!')

app.run()
```

`createCliApp(opts?, wooks?)` returns a `WooksCli` instance. Options:

```ts
interface TWooksCliOptions {
  onError?: (e: Error) => void          // custom error handler
  onNotFound?: TWooksHandler             // custom not-found handler
  onUnknownCommand?: (params: string[], raiseError: () => void) => unknown
  logger?: TConsoleBase                  // custom logger
  eventOptions?: TEventOptions           // event-level logger config
  cliHelp?: TCliHelpRenderer | TCliHelpOptions  // help renderer or options
  router?: {
    ignoreTrailingSlash?: boolean
    ignoreCase?: boolean
    cacheLimit?: number
  }
}
```

## Running Commands

### `app.run(argv?, opts?)`

Starts command processing. By default reads `process.argv.slice(2)`:

```ts
// Default: reads from process.argv
app.run()

// Override argv for testing or programmatic use
await app.run(['greet', 'Alice', '--verbose'])

// Pass minimist options to control flag parsing
await app.run(['cmd', '-cA'], { boolean: ['A'] })
```

**How `run()` works:**

1. Parses `argv` with `minimist` to separate positional args from flags.
2. Builds a route path from positional args: `['greet', 'Alice']` becomes `/greet/Alice`.
3. Creates a CLI event context with the parsed data.
4. Looks up the matching command handler via the router.
5. Executes the handler and processes the return value.

### Return value handling

The handler's return value is automatically output:

```ts
// String → console.log as-is
app.cli('text', () => 'plain text')

// Object → JSON.stringify with indentation
app.cli('json', () => ({ key: 'value' }))

// Array → each element logged separately (strings as-is, objects as JSON)
app.cli('list', () => ['line1', 'line2', { data: true }])

// undefined → no output
app.cli('silent', () => { /* side effects only */ })

// Error → triggers onError handler
app.cli('fail', () => new Error('something broke'))
```

## How CLI Context Works

When `run()` is called, the adapter creates a CLI-specific event context:

```
argv arrives
  → minimist parses flags
    → createCliContext({ argv, pathParams, cliHelp, command }, options)
      → AsyncLocalStorage.run(cliContextStore, handler)
        → router matches command path → handler runs
          → handler calls useCliOptions(), useCliHelp(), etc.
            → each composable calls useCliContext()
              → reads/writes the CLI context store via init(), get(), set()
```

### The CLI Context Store

The CLI adapter extends the base event context with:

```ts
interface TCliContextStore {
  flags?: Record<string, boolean | string>   // parsed minimist flags
}
```

The `event` section contains CLI-specific data:

```ts
interface TCliEventData {
  argv: string[]            // raw argv array
  pathParams: string[]      // positional args (non-flag)
  command: string           // matched command path
  opts?: minimist.Opts      // minimist options passed to run()
  type: 'CLI'               // event type identifier
  cliHelp: TCliHelpRenderer // help renderer instance
}
```

### Extending the CLI Store for Custom Composables

Create custom composables for CLI by extending the store type via the generic parameter on `useCliContext`:

```ts
import { useCliContext } from '@wooksjs/event-cli'

interface TMyStore {
  config?: {
    loaded?: Record<string, unknown> | null
    configPath?: string
  }
}

export function useConfig() {
  const { store } = useCliContext<TMyStore>()
  const { init } = store('config')

  const loadConfig = () =>
    init('loaded', () => {
      const flags = useCliOptions()
      const configPath = flags.config as string || './config.json'
      return JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    })

  return { loadConfig }
}
```

For the full context store API and composable patterns, see [event-core.md](event-core.md).

## Error Handling

### Default behavior

By default, errors call `console.error` and `process.exit(1)`:

```ts
app.cli('deploy', () => {
  throw new Error('Deployment failed')
})
// Output: ERROR: Deployment failed
// Process exits with code 1
```

### Custom error handler

```ts
const app = createCliApp({
  onError: (error) => {
    console.error(`[FATAL] ${error.message}`)
    process.exit(2)
  },
})
```

### Returning errors

Handlers can also return `Error` objects (not throw). The adapter passes them to `onError`:

```ts
app.cli('validate', () => {
  if (!isValid()) return new Error('Validation failed')
  return 'OK'
})
```

## Unknown Command Handling

When no route matches the provided command:

### Default behavior

Prints `"Unknown command: <args>"` and exits with code 1.

### Custom `onUnknownCommand`

```ts
const app = createCliApp({
  onUnknownCommand: (pathParams, raiseError) => {
    // pathParams = ['unknown', 'subcommand']
    console.log(`Did you mean something else?`)
    // Call raiseError() to use the default error behavior
    raiseError()
  },
})
```

### Smart command suggestions with `useCommandLookupHelp()`

The best pattern for unknown commands — suggests similar commands:

```ts
import { createCliApp, useCommandLookupHelp } from '@wooksjs/event-cli'

const app = createCliApp({
  onUnknownCommand: (path, raiseError) => {
    useCommandLookupHelp()  // throws with suggestions if found
    raiseError()            // fallback
  },
})
```

Output example:
```
ERROR: Wrong command, did you mean:
  $ mycli deploy staging
  $ mycli deploy production
```

## Custom Not-Found Handler

An alternative to `onUnknownCommand` — uses the standard Wooks handler pattern:

```ts
const app = createCliApp({
  onNotFound: () => {
    console.log('Command not recognized. Run --help for usage.')
    process.exit(1)
  },
})
```

## Sharing Router Between Adapters

Multiple adapters can share the same Wooks router:

```ts
import { Wooks } from 'wooks'
import { createCliApp } from '@wooksjs/event-cli'

const wooks = new Wooks()
const app1 = createCliApp({}, wooks)
const app2 = createCliApp({}, wooks)  // shares the same routes
```

Or share via another adapter instance:

```ts
const app1 = createCliApp()
const app2 = createCliApp({}, app1)  // shares app1's router
```

## Testing

Use `app.run()` with explicit argv arrays to test commands programmatically:

```ts
import { createCliApp } from '@wooksjs/event-cli'
import { useRouteParams } from '@wooksjs/event-core'

const app = createCliApp({
  onError: (e) => { /* don't exit in tests */ },
})

app.cli('greet/:name', () => {
  const { get } = useRouteParams<{ name: string }>()
  return `Hello, ${get('name')}!`
})

// Test:
const result = await app.run(['greet', 'Alice'])
// Handler outputs: "Hello, Alice!"
```

### Testing with flags

```ts
app.cli('deploy', () => {
  const flags = useCliOptions()
  return flags.env as string || 'development'
})

await app.run(['deploy', '--env', 'production'])
// Output: "production"

// With minimist options for boolean flags:
await app.run(['deploy', '-v'], { boolean: ['v'] })
```

## Logging

Get a scoped logger from the app:

```ts
const app = createCliApp()
const logger = app.getLogger('[my-cli]')
logger.log('CLI started')
```

Inside a handler, use the event-scoped logger:

```ts
import { useEventLogger } from '@wooksjs/event-core'

app.cli('process', () => {
  const logger = useEventLogger('process-handler')
  logger.log('Processing command')
  return 'done'
})
```

## Best Practices

- **Use `createCliApp()` factory** — Don't instantiate `WooksCli` directly unless extending the class.
- **Use `app.run(argv)` for testing** — Pass explicit argv arrays to test commands without launching a process.
- **Use `onUnknownCommand` with `useCommandLookupHelp()`** — Gives users helpful suggestions when they mistype commands.
- **Use minimist opts for boolean flags** — Pass `{ boolean: ['verbose', 'v'] }` to `app.run()` to ensure flags like `-v` are parsed as booleans, not strings.
- **Return values instead of `console.log`** — The framework handles output formatting. Returning lets you test handlers more easily.

## Gotchas

- **Composables must be called within a command handler** (inside the async context). Calling them at module load time throws.
- **`run()` returns a promise** — Always `await` it, especially in tests.
- **Command paths use `/` or space separators** — `'cmd test'` and `'cmd/test'` are equivalent.
- **Flags with `--no-` prefix** — `--no-verbose` sets `verbose: false` when using `{ boolean: ['verbose'] }` in minimist opts.
- **Positional args after flags** — minimist's `_` array contains all positional arguments, including the command segments themselves. Use `useRouteParams()` to access command arguments, not raw `_`.
- **URI encoding** — Command segments containing `/` are automatically URI-encoded so they don't create extra path segments.
