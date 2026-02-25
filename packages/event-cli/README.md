# @wooksjs/event-cli

<p align="center">
<img src="../../wooks-logo.png" width="450px"><br>
<a  href="https://github.com/wooksjs/wooksjs/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" />
</a>
</p>

CLI event processing for the Wooks framework. Build command-line applications with composable functions for flags, arguments, and auto-generated help.

## Installation

```sh
npm install @wooksjs/event-cli
```

## Documentation

For full documentation, visit [wooks.moost.org/cliapp](https://wooks.moost.org/cliapp/).

## AI Agent Skills

This package ships with structured skill files for AI coding agents (Claude Code, Cursor, Windsurf, Codex, etc.).

```bash
# Project-local (recommended — version-locked, commits with your repo)
npx wooksjs-event-cli-skill

# Global (available across all your projects)
npx wooksjs-event-cli-skill --global
```

To keep skills automatically up-to-date, add a postinstall script to your `package.json`:

```json
{
  "scripts": {
    "postinstall": "wooksjs-event-cli-skill --postinstall"
  }
}
```

## License

MIT
