# Quick Start Guide
<span class="cli-header"><span class="cli-path">/cliapp</span><span class="cli-invite">$</span> wooks cli --quick-start<span class="cli-blink">|</span></span>

## Installation

```bash
npm install @wooksjs/event-cli
```

## Usage

Here's a step-by-step guide to using Wooks CLI:

### Step 1: Import `createCliApp` factory and create an App instance

Start by importing the necessary modules and creating an instance of the Wooks CLI adapter:

::: code-group
```ts [plain]
import { createCliApp } from '@wooksjs/event-cli'
import { useRouteParams } from '@wooksjs/event-cli'

const app = createCliApp()
```
```ts [with auto-help]
import {
    createCliApp,
    useAutoHelp,
    useCommandLookupHelp,
} from '@wooksjs/event-cli'
import { useRouteParams } from '@wooksjs/event-cli'

const app = createCliApp({
    // Implementing onUnknownCommand hook
    onUnknownCommand: (path, raiseError) => {
        // Whenever cli command was not recognized by router
        // this callback will be called        
        if (!useAutoHelp()) {
            // fallback to useCommandLookupHelp if command help was not found
            useCommandLookupHelp()
            // fallback to a standard error handling when command not recognized
            raiseError()
        }
    },
})
```
:::

### Step 2: Define CLI commands

Next, you can define your CLI commands using the cli() method provided by the Wooks CLI adapter.
The cli() method allows you to register CLI commands along with their respective handlers.


::: code-group
```ts [plain]
app.cli('command/:arg', () => {
  // Handle the command and its parameters
  return 'Command executed with argument:', useRouteParams().get('arg')
});
```
```ts [with auto-help]
app.cli('command/:arg', () => {
  useAutoHelp() && process.exit(0)  // Print help if --help option provided
  // Handle the command and its parameters
  return 'Command executed with argument:', useRouteParams().get('arg')
});
```
:::

### Step 3: Start command processing

To start processing CLI commands, you can call the `run()` method of the Wooks CLI adapter.
By default, it uses `process.argv.slice(2)` as the command, but you can also pass your own argv array as an argument.

```ts
app.run()
```

### Step 4: Execute CLI commands

You can now execute your registered CLI commands by running your script with the appropriate command and arguments.
Here's an example:

```bash
node your-script.js command test
```

This will execute the registered CLI command with the argument "test" and log the result to the console.

## Advanced Usage

Wooks CLI provides additional features and options for building more complex CLIs. Some of the notable features include:

-   Defining command [aliases](/cliapp/cli-help#aliases)
-   Adding [descriptions](/cliapp/cli-help#command-description), [options](/cliapp/cli-help#options), and [examples](/cliapp/cli-help#examples) to commands
-   Handling unknown commands
-   Error handling and customization

## AI Agent Skills

Wooks provides a unified skill for AI coding agents (Claude Code, Cursor, Windsurf, Codex, etc.) that covers all packages with progressive-disclosure reference docs.

```bash
npx skills add wooksjs/wooksjs
```

Learn more about AI agent skills at [skills.sh](https://skills.sh).

For more details, explore [Routing](/cliapp/routing), [Options](/cliapp/options), and [Help Generation](/cliapp/cli-help).
