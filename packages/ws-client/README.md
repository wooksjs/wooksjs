# @wooksjs/ws-client

<p align="center">
<img src="../../wooks-logo.png" width="450px"><br>
<a  href="https://github.com/wooksjs/wooksjs/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" />
</a>
</p>

WebSocket client for Wooks with RPC, subscriptions, reconnection, push listeners, and message queuing. Works in browsers and Node.js.

## Installation

```sh
npm install @wooksjs/ws-client
```

## Documentation

For full documentation, visit [wooks.moost.org](https://wooks.moost.org/wsapp/).

## AI Agent Skills

This package ships with structured skill files for AI coding agents (Claude Code, Cursor, Windsurf, Codex, etc.).

```bash
# Project-local (recommended — version-locked, commits with your repo)
npx wooksjs-ws-client-skill

# Global (available across all your projects)
npx wooksjs-ws-client-skill --global
```

To keep skills automatically up-to-date, add a postinstall script to your `package.json`:

```json
{
  "scripts": {
    "postinstall": "wooksjs-ws-client-skill --postinstall"
  }
}
```

## License

MIT
