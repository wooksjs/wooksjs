# @wooksjs/event-ws

<p align="center">
<img src="../../wooks-logo.png" width="450px"><br>
<a  href="https://github.com/wooksjs/wooksjs/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" />
</a>
</p>

WebSocket adapter for Wooks with path-based message routing, rooms, broadcasting, and composable context. Runs standalone or integrated with `@wooksjs/event-http`.

## Installation

```sh
npm install @wooksjs/event-ws @wooksjs/event-http ws
```

## Documentation

For full documentation, visit [wooks.moost.org](https://wooks.moost.org/wsapp/).

## AI Agent Skills

This package ships with structured skill files for AI coding agents (Claude Code, Cursor, Windsurf, Codex, etc.).

```bash
# Project-local (recommended — version-locked, commits with your repo)
npx wooksjs-event-ws-skill

# Global (available across all your projects)
npx wooksjs-event-ws-skill --global
```

To keep skills automatically up-to-date, add a postinstall script to your `package.json`:

```json
{
  "scripts": {
    "postinstall": "wooksjs-event-ws-skill --postinstall"
  }
}
```

## License

MIT
