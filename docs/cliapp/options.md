# Command Options

<span class="cli-header"><span class="cli-path">/cliapp</span><span class="cli-invite">$</span> wooks cli --options<span class="cli-blink">|</span></span>

Wooks CLI supports handling options in your CLI commands.
Options are typically defined with a double hyphen (`--`) or a single hyphen (`-`) prefix and can have an associated value.

To define options in Wooks CLI, you can use the options property when registering your command. Here's an example:

```js
import { useCliOption } from '../../packages/event-cli'

app.cli('my-command', {
  options: [
    // Define the "--project" option with a shortcut as "-p"
    { keys: ['project', 'p'] },
  ],
  handler: () => {
    const project = useCliOption('project')
    return 'my command option project = ' + project
  },
})
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
