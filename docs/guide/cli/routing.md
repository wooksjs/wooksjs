# Routing
<span class="cli-header"><span class="cli-path">/guide</span><span class="cli-invite">$</span> wooks cli --routing<span class="cli-blink">|</span></span>

Wooks CLI provides a powerful routing system that allows you to define and handle command-line interface (CLI) commands with ease.
This documentation will guide you through the process of defining routes, handling arguments, and working with options in Wooks CLI.

::: info
Wooks utilizes [@prostojs/router](https://github.com/prostojs/router) for routing, and its
documentation is partially included here for easy reference.
:::

## Routing Basics

In Wooks CLI, routing is the process of mapping CLI commands to their respective handlers.
A route consists of a command pattern.
The command pattern defines the structure of the command, including the command name and arguments.

## Command Structure

Wooks CLI represents commands as paths due to the underlying router used.
For example, to define the command `npm install @wooksjs/event-cli`, you can use the following command pattern:

```js
'/install/:package'
```

In the above pattern, `:package` represents a variable. Alternatively, you can use a _space_ as a separator, like this:

```js
'install :package'
```

Both command patterns serve the same purpose.

If you need to use a colon in your command, it must be escaped with a backslash (\\). For example:

```js
'app build\\:dev'
```

The above command pattern allows the command to be executed as follows:

```bash
my-cli app build:dev
```

## Options

Wooks CLI supports handling options in your CLI commands.
Options are typically defined with a double hyphen (`--`) or a single hyphen (`-`) prefix and can have an associated value.

To define options in Wooks CLI, you can use the options property when registering your command. Here's an example:

```js
import { useFlag } from '../../packages/event-cli'

app.cli('my-command', {
  options: [
    // Define the "--project" option with a shortcut as "-p"
    { keys: ['project', 'p'] },
  ],
  handler: () => {
    const project = useFlag('project');
    return 'my command option project = ' + project;
  },
});
```

With the above command configuration, you can execute the command as follows:
```bash
node your-script.js my-command --project=test
```
Alternatively, you can use the shortcut for `project` option:
```bash
node your-script.js my-command -p=test
```

This will trigger the CLI command with the `project` option set to `"test"` and log the result to the console.

By understanding routing basics and working with options in Wooks CLI, you can create powerful and flexible CLI commands with ease.
