# Commands & Help — @wooksjs/event-cli

> Covers command registration, command path syntax (arguments, aliases, options, examples), flag/option composables, help generation, and route parameters in CLI context.

## Command Registration

### `app.cli(path, handler)`

Register a command with a simple handler:

```ts
import { createCliApp } from '@wooksjs/event-cli'

const app = createCliApp()

app.cli('deploy', () => {
  return 'Deploying...'
})

app.run()
// $ mycli deploy → "Deploying..."
```

### `app.cli(path, options)`

Register a command with full metadata for help generation:

```ts
app.cli('deploy/:env', {
  description: 'Deploy to a target environment',
  args: {
    env: 'Target environment (staging, production)',
  },
  options: [
    { keys: ['force', 'f'], description: 'Skip confirmation prompt' },
    { keys: ['tag', 't'], description: 'Docker image tag', value: 'latest' },
  ],
  aliases: ['d'],
  examples: [
    {
      description: 'Deploy to production with a specific tag',
      cmd: 'production -t=v2.1.0',
    },
  ],
  handler: () => {
    const { get } = useRouteParams<{ env: string }>()
    const flags = useCliOptions()
    return `Deploying to ${get('env')} (force=${flags.force || false})`
  },
})
```

### Options object shape

```ts
interface TWooksCliEntry<T> {
  handler: TWooksHandler<T>               // the command handler function
  description?: string                     // command description for help text
  args?: Record<string, string>            // { argName: 'description' }
  options?: Array<{
    keys: string[]                         // ['verbose', 'v'] → --verbose or -v
    description?: string                   // option description for help
    value?: string                         // default/example value shown in help
  }>
  aliases?: string[]                       // alternative command names
  examples?: Array<{
    description: string                    // example description
    cmd: string                            // example command (without CLI name)
  }>
  onRegister?: (path: string, aliasType: number, route?: any) => void
}
```

## Command Path Syntax

Command paths use the same `@prostojs/router` syntax as HTTP routes. Space and `/` separators are equivalent.

### Static commands

```ts
app.cli('deploy', handler)           // $ mycli deploy
app.cli('db migrate', handler)       // $ mycli db migrate
app.cli('db/migrate', handler)       // same as above
app.cli('config set', handler)       // $ mycli config set
```

### Named arguments (`:argName`)

Captures a single positional argument:

```ts
import { useRouteParams } from '@wooksjs/event-core'

app.cli('greet/:name', {
  args: { name: 'Person to greet' },
  handler: () => {
    const { get } = useRouteParams<{ name: string }>()
    return `Hello, ${get('name')}!`
  },
})
// $ mycli greet Alice → "Hello, Alice!"
```

### Multiple arguments

```ts
app.cli('copy/:source/:dest', {
  args: {
    source: 'Source file path',
    dest: 'Destination file path',
  },
  handler: () => {
    const { params } = useRouteParams<{ source: string; dest: string }>()
    return `Copying ${params.source} to ${params.dest}`
  },
})
// $ mycli copy file.txt backup/file.txt
```

### Optional arguments (`:arg?`)

Append `?` to make an argument optional. Optional args must be at the end:

```ts
app.cli('logs/:service/:lines?', {
  args: {
    service: 'Service name',
    lines: 'Number of lines (default: 50)',
  },
  handler: () => {
    const { get } = useRouteParams<{ service: string; lines?: string }>()
    const lines = get('lines') || '50'
    return `Showing last ${lines} lines of ${get('service')}`
  },
})
// $ mycli logs api       → "Showing last 50 lines of api"
// $ mycli logs api 100   → "Showing last 100 lines of api"
```

### Wildcards (`*`)

Capture arbitrary remaining arguments:

```ts
app.cli('exec/*', {
  handler: () => {
    const { get } = useRouteParams<{ '*': string }>()
    return `Running: ${get('*')}`
  },
})
// $ mycli exec npm install → "Running: npm/install"
```

### Regex-constrained arguments

Restrict what an argument matches:

```ts
app.cli('migrate/:version(\\d+)', {
  args: { version: 'Migration version number' },
  handler: () => {
    const { get } = useRouteParams<{ version: string }>()
    return `Migrating to version ${get('version')}`
  },
})
// $ mycli migrate 42   → matches
// $ mycli migrate abc  → does NOT match (unknown command)
```

### Hyphen-separated arguments

```ts
app.cli('schedule/:from-:to', {
  handler: () => {
    const { get } = useRouteParams<{ from: string; to: string }>()
    return `Scheduled from ${get('from')} to ${get('to')}`
  },
})
// $ mycli schedule 09:00-17:00
```

## Command Aliases

Aliases register additional paths that invoke the same handler:

```ts
app.cli('deploy/:env', {
  aliases: ['d'],
  args: { env: 'Target environment' },
  handler: () => {
    const { get } = useRouteParams<{ env: string }>()
    return `Deploying to ${get('env')}`
  },
})
// $ mycli deploy staging  → works
// $ mycli d staging       → also works (alias)
```

Aliases automatically inherit the command's arguments. The alias `'d'` becomes `'d/:env'`.

## Accessing Flags and Options

### `useCliOptions()`

Returns all parsed flags as an object (uses `minimist` under the hood):

```ts
import { useCliOptions } from '@wooksjs/event-cli'

app.cli('build', () => {
  const flags = useCliOptions()
  // $ mycli build --env production --verbose -p 8080
  // flags = { _: ['build'], env: 'production', verbose: true, p: 8080 }
  return `Building for ${flags.env}`
})
```

The `_` property contains all positional arguments (including command segments).

### `useCliOption(name)`

Get a single option value. Resolves aliases — if you defined `keys: ['verbose', 'v']`, calling `useCliOption('verbose')` also checks `-v`:

```ts
import { useCliOption } from '@wooksjs/event-cli'

app.cli('build', {
  options: [
    { keys: ['env', 'e'], description: 'Target environment', value: 'dev' },
    { keys: ['verbose', 'v'], description: 'Verbose output' },
  ],
  handler: () => {
    const env = useCliOption('env')       // checks --env and -e
    const verbose = useCliOption('verbose') // checks --verbose and -v
    return `Building for ${env || 'dev'} (verbose: ${!!verbose})`
  },
})
// $ mycli build -e production -v
```

### Minimist parsing options

Control how flags are parsed by passing options to `app.run()`:

```ts
// Ensure -A is parsed as boolean (true/false), not string
await app.run(['build', '-cA'], { boolean: ['A'] })

// Negate boolean flags with --no- prefix
await app.run(['build', '--no-cache'], { boolean: ['cache'] })
// → { cache: false }

// Default values
await app.run(['build'], { default: { env: 'development' } })
// → { env: 'development' }
```

## Help System

### Registering help metadata

Help metadata is defined alongside the command:

```ts
app.cli('db migrate/:direction?', {
  description: 'Run database migrations',
  args: {
    direction: 'Migration direction: up or down (default: up)',
  },
  options: [
    { keys: ['seed', 's'], description: 'Run seeds after migration' },
    { keys: ['dry-run'], description: 'Preview changes without applying' },
  ],
  examples: [
    { description: 'Run all pending migrations', cmd: 'up' },
    { description: 'Rollback last migration', cmd: 'down' },
    { description: 'Preview migration with seeding', cmd: 'up -s --dry-run' },
  ],
  handler: () => { /* ... */ },
})
```

### `useCliHelp()`

Access the help system from within a handler:

```ts
import { useCliHelp } from '@wooksjs/event-cli'

app.cli('help', () => {
  const { print, render, getEntry, getCliHelp } = useCliHelp()

  print(true)          // print help to stdout (with colors)
  print(false)         // print without colors

  const lines = render(80, true)  // render as string array (width, colors)

  const entry = getEntry()        // get the matched help entry
  // entry.description, entry.options, entry.args, entry.examples

  const cliHelp = getCliHelp()    // access the CliHelpRenderer directly
})
```

### `useAutoHelp(keys?, colors?)`

Automatically prints help when `--help` is passed. Returns `true` if help was printed:

```ts
import { useAutoHelp } from '@wooksjs/event-cli'

app.cli('deploy/:env', {
  description: 'Deploy to environment',
  handler: () => {
    if (useAutoHelp()) return  // prints help and returns if --help was passed

    // Normal handler logic
    const { get } = useRouteParams<{ env: string }>()
    return `Deploying to ${get('env')}`
  },
})
// $ mycli deploy --help → prints formatted help
// $ mycli deploy staging → "Deploying to staging"
```

Customize the trigger keys and color setting:

```ts
// Trigger on --help or -h, without colors
if (useAutoHelp(['help', 'h'], false)) {
  process.exit(0)
}
```

### `useCommandLookupHelp(lookupDepth?)`

Searches for similar valid commands when a wrong command is entered. Throws an error with suggestions if found. Best used in `onUnknownCommand`:

```ts
import { createCliApp, useCommandLookupHelp } from '@wooksjs/event-cli'

const app = createCliApp({
  onUnknownCommand: (path, raiseError) => {
    useCommandLookupHelp()  // throws with suggestions
    raiseError()            // fallback if no suggestions found
  },
})
```

The lookup works backwards through the command path:

```
For command "run test:drive dir":
  lookup 1: "run test:drive dir"  (depth 0)
  lookup 2: "run test:drive"      (depth 1)
  lookup 3: "run test"            (depth 2)
  lookup 4: "run"                 (depth 3)
```

Default `lookupDepth` is 3. If a partial match with children is found, it suggests child commands. If arguments are expected, it says what arguments are missing.

### Help Renderer Configuration

Customize the help renderer when creating the app:

```ts
import { CliHelpRenderer } from '@prostojs/cli-help'

// Option 1: Pass options
const app = createCliApp({
  cliHelp: {
    name: 'mycli',       // CLI name shown in help and examples
    // marks, width, etc.
  },
})

// Option 2: Pass a pre-configured renderer
const renderer = new CliHelpRenderer({ name: 'mycli' })
const app = createCliApp({ cliHelp: renderer })
```

## Route Parameters in CLI

CLI commands use the same `useRouteParams()` from `@wooksjs/event-core` as HTTP routes:

```ts
import { useRouteParams } from '@wooksjs/event-core'

app.cli('user/:action/:id?', {
  handler: () => {
    const { params, get } = useRouteParams<{
      action: string
      id?: string
    }>()

    get('action')  // 'create', 'delete', etc.
    get('id')      // '42' or undefined
    params         // { action: 'create', id: '42' }
  },
})
```

Parameters are always `string` (or `string[]` for repeated params). Cast numerics yourself: `Number(get('id'))`.

## Common Patterns

### Pattern: Multi-command CLI with help

```ts
const app = createCliApp({
  onUnknownCommand: (path, raiseError) => {
    useCommandLookupHelp()
    raiseError()
  },
})

app.cli('init/:name?', {
  description: 'Initialize a new project',
  args: { name: 'Project name (default: current directory)' },
  options: [
    { keys: ['template', 't'], description: 'Project template', value: 'default' },
  ],
  handler: () => {
    if (useAutoHelp()) return
    const { get } = useRouteParams<{ name?: string }>()
    const template = useCliOption('template') || 'default'
    return `Initialized ${get('name') || '.'} with template ${template}`
  },
})

app.cli('build', {
  description: 'Build the project',
  options: [
    { keys: ['watch', 'w'], description: 'Watch mode' },
    { keys: ['minify', 'm'], description: 'Minify output' },
  ],
  handler: () => {
    if (useAutoHelp()) return
    const flags = useCliOptions()
    return `Building... (watch=${!!flags.watch}, minify=${!!flags.minify})`
  },
})

app.cli('serve', {
  description: 'Start development server',
  options: [
    { keys: ['port', 'p'], description: 'Port number', value: '3000' },
    { keys: ['host', 'h'], description: 'Host address', value: 'localhost' },
  ],
  handler: () => {
    if (useAutoHelp()) return
    const port = useCliOption('port') || '3000'
    const host = useCliOption('host') || 'localhost'
    return `Serving at http://${host}:${port}`
  },
})

app.run()
```

### Pattern: Subcommands with shared logic

```ts
// Shared composable for database connection
function useDbConnection() {
  const { store } = useCliContext<{ db?: { conn?: any } }>()
  const { init } = store('db')
  return {
    getConnection: () => init('conn', () => {
      const flags = useCliOptions()
      return connectToDb(flags['db-url'] as string || 'localhost:5432')
    }),
  }
}

app.cli('db migrate', {
  description: 'Run pending migrations',
  handler: async () => {
    const { getConnection } = useDbConnection()
    const db = getConnection()
    await db.migrate()
    return 'Migrations complete'
  },
})

app.cli('db seed', {
  description: 'Run database seeds',
  handler: async () => {
    const { getConnection } = useDbConnection()
    const db = getConnection()
    await db.seed()
    return 'Seeding complete'
  },
})
```

### Pattern: Global flags

```ts
// Check global flags in every handler
function useGlobalFlags() {
  const flags = useCliOptions()
  if (flags.verbose || flags.v) {
    const logger = useEventLogger('cli')
    logger.log('Verbose mode enabled')
  }
  return {
    verbose: !!(flags.verbose || flags.v),
    quiet: !!(flags.quiet || flags.q),
    dryRun: !!(flags['dry-run']),
  }
}

app.cli('deploy/:env', {
  handler: () => {
    const { verbose, dryRun } = useGlobalFlags()
    const { get } = useRouteParams<{ env: string }>()
    if (dryRun) return `[DRY RUN] Would deploy to ${get('env')}`
    return `Deploying to ${get('env')}`
  },
})
```

## Best Practices

- **Use `app.cli(path, options)` with metadata** — Always provide `description` and `args` so help generation works out of the box.
- **Use `useAutoHelp()` at the top of every handler** — Gives users consistent `--help` behavior across all commands.
- **Use `useCliOption(name)` over `useCliOptions()[name]`** — `useCliOption` resolves key aliases (e.g., `--verbose` / `-v`), so it respects your option definitions.
- **Use `onUnknownCommand` with `useCommandLookupHelp()`** — Provides a much better user experience than a generic "unknown command" error.
- **Return values from handlers** — Don't call `console.log` directly; the framework formats and outputs return values automatically. This also makes testing easier.
- **Type your route params** — Use `useRouteParams<{ env: string }>()` for type-safe access.
- **Use regex constraints for numeric args** — `:version(\\d+)` prevents non-numeric values from matching.

## Gotchas

- **Spaces and slashes are equivalent** — `'cmd test'` and `'cmd/test'` register the same command path. When displayed, they appear as spaces.
- **Flags containing colons** — If a command segment contains a colon that isn't a parameter, escape it: `'config set\\:key'` → matches `$ mycli config set:key`.
- **`useCliOptions()` includes `_` array** — The `_` property from minimist contains all positional args, including command segments. Use `useRouteParams()` for named arguments instead.
- **Aliases inherit arguments** — An alias like `'d'` for `'deploy/:env'` automatically becomes `'d/:env'`. You don't need to add the `:env` yourself.
- **Boolean flag negation** — `--no-cache` with `{ boolean: ['cache'] }` sets `cache: false`. Without the boolean option, it becomes `{ 'no-cache': true }`.
- **Route precedence** — Static segments match before parametric, parametric before wildcard. `'deploy staging'` is preferred over `'deploy/:env'` when the input is `deploy staging`.
