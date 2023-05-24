# Quick Start CLI Guide
<span class="cli-header"><span class="cli-path">/guide</span><span class="cli-invite">$</span> wooks cli --quick-start<span class="cli-blink">|</span></span>

::: warning
Work on Wooks is still in progress. It is already suitable for immediate use in CLI events,
but some APIs may still undergo changes.
:::

This guide will help you get started with using Wooks CLI to build powerful command-line interfaces (CLIs) for your applications.
Wooks CLI leverages the concept of composables and event context to provide a seamless and flexible workflow for processing CLI commands.
Let's dive in!

## Installation

To install Wooks CLI, you need to have Node.js and npm (Node Package Manager) installed on your system.
Once you have them set up, you can install Wooks CLI using the following command:

```bash
npm install wooks @wooksjs/event-cli
```

## Usage

Here's a step-by-step guide to using Wooks CLI:

### Step 1: Import `createCliApp` factory and create an App instance

Start by importing the necessary modules and creating an instance of the Wooks CLI adapter:

::: code-group
```ts [plain]
import { createCliApp } from '@wooksjs/event-cli'
import { useRouteParams } from 'wooks'

const app = createCliApp()
```
```ts [with auto-help]
import {
    createCliApp,
    useAutoHelp,
    useCommandLookupHelp,
} from '@wooksjs/event-cli'
import { useRouteParams } from 'wooks'

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

-   Defining command aliases
-   Adding descriptions, options, and examples to commands
-   Handling unknown commands
-   Error handling and customization

That's it! You have completed the Quick Start Guide for Wooks CLI.
You now have the basic knowledge and steps to start building your own CLI applications using Wooks CLI.
Feel free to explore the documentation and experiment with different configurations and options to suit your specific requirements.

Happy command-line scripting with Wooks CLI!
