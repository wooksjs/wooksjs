# Command Options
<span class="cli-header"><span class="cli-path">/cliapp</span><span class="cli-invite">$</span> wooks cli --options<span class="cli-blink">|</span></span>

Wooks CLI supports handling options in your CLI commands.
Options are typically defined with a double hyphen (`--`) or a single hyphen (`-`) prefix and can have an associated value.

To define options in Wooks CLI, you can use the options property when registering your command. Here's an example:

```js
import { useCliOption } from '@wooksjs/event-cli'

app.cli('my-command', {
  options: [
    // Define the "--project" option with a shortcut as "-p"
    { keys: ['project', 'p'] },
  ],
  handler: () => {
    const project = useCliOption('project');
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

## Reading All Options

`useCliOptions()` returns the full parsed-flags object, including the positional arguments in `_`:

```js
import { useCliOptions } from '@wooksjs/event-cli'

app.cli('my-command/:arg?', {
  handler: () => {
    const flags = useCliOptions()
    // node your-script.js my-command extra --project=test -v
    // flags = { _: ['my-command', 'extra'], project: 'test', v: true }
    return JSON.stringify(flags)
  },
});
```

## Parsing Behavior

Options are parsed with [minimist](https://www.npmjs.com/package/minimist). To customize parsing (`string`, `boolean`, `alias`, `default`, ...), pass minimist options as the second argument of `run()`:

```js
app.run(undefined, { boolean: ['verbose'], alias: { v: 'verbose' } })
```

## Gotchas

-   `useCliOption('project')` resolves synonyms (e.g., `-p` for `--project`) only when the option is declared in the command's `options` metadata (see [Command Usage (Help) — Options](/cliapp/cli-help#options)). For undeclared options it looks up the raw flag name only.
