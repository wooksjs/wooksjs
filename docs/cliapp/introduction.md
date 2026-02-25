# Introduction to Wooks CLI
<span class="cli-header"><span class="cli-path">/cliapp</span><span class="cli-invite">$</span> wooks cli --introduction<span class="cli-blink">|</span></span>

`@wooksjs/event-cli` is the CLI adapter for Wooks. It lets you build command-line applications using the same composable architecture as Wooks HTTP — routed commands, typed options, auto-generated help, and per-invocation context via `AsyncLocalStorage`.

## Key Components

- **`createCliApp()`** — Factory that creates a CLI application with routing, option parsing, and help generation
- **`app.cli(pattern, handler)`** — Register commands with route-style patterns (e.g., `deploy/:env`)
- **Composables** — `useCliOptions()`, `useCliOption()`, `useAutoHelp()`, `useRouteParams()` for accessing parsed CLI data
- **Help Renderer** — Powered by [@prostojs/cli-help](https://github.com/prostojs/cli-help), auto-generates `--help` output from command metadata
