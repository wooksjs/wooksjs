# Command Usage (Help)
<span class="cli-header"><span class="cli-path">/cliapp</span><span class="cli-invite">$</span> wooks cli --help<span class="cli-blink">|</span></span>

The Cli Help rendering option in Wooks CLI provides a convenient way to generate command-line
interface (CLI) help and usage information for your commands.
It utilizes the CliHelpRenderer class (from [@prostojs/cli-help](https://github.com/prostojs/cli-help))
under the hood to generate formatted output based on the provided command configuration.

## Usage

To enable the Cli Help rendering option, you need to define the command documentation when calling
`WooksCli.cli()` to register your command. Here's an example of how to use it:

```js
app.cli('my-command/:arg', {
  description: 'Description of the command',
  options: [
    { keys: ['project', 'p'], description: 'Description of the option', value: 'myProject' },
  ],
  args: { arg: 'Description of the arg' },
  aliases: ['cmd'],
  examples: [
    {
      description: 'Example of usage with someProject',
      cmd: 'argValue -p=someProject',
    },
  ],
  handler: () => '...',
});
```
In the above example, we define a command named `my-command/:arg` with its description, options, arguments, aliases, examples, and a command handler.

### Command Description
The `description` property allows you to provide a description for your command. It should give users an understanding of what the command does.

Example:
```js
app.cli('my-command', {
  description: 'Description of the command', // [!code focus]
  handler: () => '...',
});
```

### Options
The `options` property is an array that defines the available options for your command. Each option is represented by an object with the following properties:

-   `keys`: An array of option keys that describe synonyms for the option. For example, `['project', 'p']` stands for `--project=...` input, and it has a shortcut `-p=...` that can be used as an alternative option.
-   `description`: (Optional) The description of the option, which explains its purpose.
-   `value`: (Optional) An example of the value that will be represented in the CLI command usage.

Example:
```js
app.cli('my-command', {
  options: [{ // [!code focus]
    keys: ['project', 'p'], // [!code focus]
    description: 'Description of the option', // [!code focus]
    value: 'myProject' // [!code focus]
  }], // [!code focus]
  handler: () => '...',
});
```

### Arguments
The args property is an object where each key represents the name of an argument, and the corresponding value is the description of the argument.
It helps users understand the purpose of each argument in the command.

Example:
```js
app.cli('my-command/:name', {
  args: { name: 'Description of the argument name' },  // [!code focus]
  handler: () => '...',
});
```

### Aliases
The aliases property is an array that allows you to specify aliases for your command.
Aliases provide alternative names for the command, making it more flexible for users.

Example:
```js
app.cli('my-command', {
  aliases: ['cmd'], // [!code focus]
  handler: () => '...',
});
```

### Examples
The examples property is an array that contains examples demonstrating the usage of your command.
Each example is represented by an object with the following properties:

-  `description`: A description explaining the purpose of the example.
-  `cmd`: The command string that represents the example. This command will be displayed in the help output.

Example:
```js
app.cli('my-command', {
  examples: [{   // [!code focus]
      description: 'Example of usage with someProject',  // [!code focus]
      cmd: 'argValue -p=someProject',  // [!code focus]
  }],  // [!code focus]
  handler: () => '...',
});
```

### Command Handler
The handler property represents the function that will be executed when the command is invoked.
This function can contain the logic for handling the command and returning the desired result.

Example:
```js
app.cli('my-command', {
  handler: () => {     // [!code focus]
    return 'my-command executed'     // [!code focus]
  },     // [!code focus]
});
```

## Automatic Help Display
To enable automatic help display when the `--help` option is used, you can use the `useAutoHelp` composable function within your command's handler. Here's an example:
```js
app.cli('root/:arg', {
  args: { arg: 'First argument' },
  description: 'Root Command Descr',
  options: [
    { keys: ['project', 'p'], description: 'Project name', value: 'test' },
  ],
  aliases: ['root'],
  handler: () => {
    if (useAutoHelp()) {  // [!code ++]
      process.exit(0); // Stop the command if help is displayed // [!code ++]
    } // [!code ++]
    // Proceed with handling the command
    return 'done ' + useCliOption('project');
  },
});
```

When running this command with option `--help` you'll see the usage instructions:
```bash
node your-script.js root --help
```

In the above example, `useAutoHelp` is used to check if the `--help` option was supplied.
If it is detected, the command usage and help information will be printed, and the command execution will be stopped by calling `process.exit(0)`.

Please note that `useAutoHelp` is only triggered if the command is routed to one of the registered handlers.
If the command is valid but the input is missing the required arguments, the router won't be able to match the input to the corresponding handler.
Therefore, the handler won't be processed and `useAutoHelp` function won't be invoked.
To handle such cases and still provide the user with usage help instructions, you can utilize the `onUnknownCommand` hook provided in the `createCliApp` options.
Inside the `onUnknownCommand` hook, you can use the `useAutoHelp` function to check if the `--help` option is present and display the command usage instructions accordingly,
ensuring that the user receives the necessary guidance even when the input doesn't match due to missing arguments.
Here's an example:
```js
// Create a CLI app with onUnknownCommand hook
const app = createCliApp({
    // This callback is triggered when the CLI command is not recognized by the router
    onUnknownCommand: (path, raiseError) => {
        // Whenever cli command was not recognized by router
        // this callback will be called        
        if (!useAutoHelp()) {
            // Display command lookup help if command help was not found
            useCommandLookupHelp()
            // Raise a standard error when the command is not recognized
            raiseError()
        }
    },
});
```
In the example above, the `onUnknownCommand` hook utilizes `useAutoHelp` to check if the `--help` option is present.
If the option is not detected, the `useCommandLookupHelp` function is used to display command lookup help, which includes
a list of suggested commands that closely match what the user entered.
Finally, an error is raised to indicate that the command was not recognized.

By leveraging the Cli Help rendering option and the `useAutoHelp` composable function, you can provide helpful command-line usage information and facilitate a better user experience for your CLI commands.
