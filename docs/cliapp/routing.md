# Routing
<span class="cli-header"><span class="cli-path">/cliapp</span><span class="cli-invite">$</span> wooks cli --routing<span class="cli-blink">|</span></span>

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

### Optional Parameters

You can define optional route parameter

```js
'app build :target?'
```

In th example above parameter `target` will be optional.

```bash
my-cli app build
```

```bash
my-cli app build my-target
```

Both commands will be handled by `app build :target?` pattern. In the first scenario parameter `target` will be undefined. In the second scenario parameter `target` will get `my-target` value.
