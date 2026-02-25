# @wooksjs/event-wf

<p align="center">
<img src="../../wooks-logo.png" width="450px"><br>
<a  href="https://github.com/wooksjs/wooksjs/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" />
</a>
</p>

Workflow event processing for the Wooks framework. Manage complex workflows with conditional branching, parametric steps, and user input requirements, built on top of [@prostojs/wf](https://github.com/prostojs/wf).

## Installation

```sh
npm install @wooksjs/event-wf
```

## Documentation

For full documentation, visit [wooks.moost.org/wf](https://wooks.moost.org/wf/).

## AI Agent Skills

This package ships with structured skill files for AI coding agents (Claude Code, Cursor, Windsurf, Codex, etc.).

```bash
# Project-local (recommended — version-locked, commits with your repo)
npx wooksjs-event-wf-skill

# Global (available across all your projects)
npx wooksjs-event-wf-skill --global
```

To keep skills automatically up-to-date, add a postinstall script to your `package.json`:

```json
{
  "scripts": {
    "postinstall": "wooksjs-event-wf-skill --postinstall"
  }
}
```

## License

MIT
