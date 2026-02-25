# @wooksjs/event-core

<p align="center">
<img src="../../wooks-logo.png" width="450px"><br>
<a  href="https://github.com/wooksjs/wooksjs/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" />
</a>
</p>

Typed, per-event context with lazy cached computations, composable API, and AsyncLocalStorage propagation. The foundation of the Wooks event processing framework.

## Installation

```sh
npm install @wooksjs/event-core
```

## Documentation

For full documentation, visit [wooks.moost.org](https://wooks.moost.org/wooks/).

## AI Agent Skills

This package ships with structured skill files for AI coding agents (Claude Code, Cursor, Windsurf, Codex, etc.).

```bash
# Project-local (recommended — version-locked, commits with your repo)
npx wooksjs-event-core-skill

# Global (available across all your projects)
npx wooksjs-event-core-skill --global
```

To keep skills automatically up-to-date, add a postinstall script to your `package.json`:

```json
{
  "scripts": {
    "postinstall": "wooksjs-event-core-skill --postinstall"
  }
}
```

## License

MIT
