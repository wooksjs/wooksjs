# @wooksjs/event-http

<p align="center">
<img src="../../wooks-logo.png" width="450px"><br>
<a  href="https://github.com/wooksjs/wooksjs/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" />
</a>
</p>

HTTP event processing for the Wooks framework. Provides composables for request parsing, response management, cookies, headers, caching, and more — all lazily computed and cached per event.

## Installation

```sh
npm install @wooksjs/event-http
```

## Documentation

For full documentation, visit [wooks.moost.org/webapp](https://wooks.moost.org/webapp/).

## AI Agent Skills

This package ships with structured skill files for AI coding agents (Claude Code, Cursor, Windsurf, Codex, etc.).

```bash
# Project-local (recommended — version-locked, commits with your repo)
npx wooksjs-event-http-skill

# Global (available across all your projects)
npx wooksjs-event-http-skill --global
```

To keep skills automatically up-to-date, add a postinstall script to your `package.json`:

```json
{
  "scripts": {
    "postinstall": "wooksjs-event-http-skill --postinstall"
  }
}
```

## License

MIT
