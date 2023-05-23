# Command Usage (Help)
<span class="cli-header"><span class="cli-path">/guide</span><span class="cli-invite">$</span> wooks cli --help<span class="cli-blink">|</span></span>

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

### Options
The `options` property is an array that defines the available options for your command. Each option is represented by an object with the following properties:

-   `keys`: An array of option keys that describe synonyms for the option. For example, `['project', 'p']` stands for `--project=...` input, and it has a shortcut `-p=...` that can be used as an alternative option.
-   `description`: (Optional) The description of the option, which explains its purpose.
-   `value`: (Optional) An example of the value that will be represented in the CLI command usage.

### Arguments
The args property is an object where each key represents the name of an argument, and the corresponding value is the description of the argument.
It helps users understand the purpose of each argument in the command.

### Aliases
The aliases property is an array that allows you to specify aliases for your command.
Aliases provide alternative names for the command, making it more flexible for users.

### Examples
The examples property is an array that contains examples demonstrating the usage of your command.
Each example is represented by an object with the following properties:

-  description: A description explaining the purpose of the example.
-  cmd: The command string that represents the example. This command will be displayed in the help output.

### Command Handler
The handler property represents the function that will be executed when the command is invoked.
This function can contain the logic for handling the command and returning the desired result.


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
    if (useAutoHelp()) {
      process.exit(0); // Stop the command if help is displayed
    }
    // Proceed with handling the command
    return 'done ' + useFlag('project');
  },
});
```

When running this command with option `--help` you'll see the usage instructions:
```bash
node your-script.js root --help
```

In the above example, `useAutoHelp` is used to check if the `--help` option was supplied.
If it is detected, the command usage and help information will be printed, and the command execution will be stopped by calling `process.exit(0)`.

It's important to note that `useAutoHelp` is only triggered if the command is routed to one of the registered handlers.
If the command is not recognized, the `useAutoHelp` function won't be invoked automatically.
To handle such cases, you can use `useAutoHelp` within the `onUnknownCommand` hook provided in the `createCliApp` options. Here's an example:

```js
const app = createCliApp({
  onUnknownCommand: (path, raiseError) => {
    if (!useAutoHelp()) {
      useCommandLookupHelp();
      raiseError();
    }
  },
});
```
In the above example, `useAutoHelp` is used inside the `onUnknownCommand` hook.
If the `--help` option is not detected, the `useCommandLookupHelp` function is used to display command lookup help, and an error is raised to indicate that the command was not recognized.

By leveraging the Cli Help rendering option and the `useAutoHelp` composable function, you can provide helpful command-line usage information and facilitate a better user experience for your CLI commands.
