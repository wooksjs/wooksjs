#!/usr/bin/env node
// @ts-check
/**
 * Copies the event-wf skill files into the consuming project's
 * agent-skills directory so that AI coding agents (Claude Code, Cursor,
 * Windsurf, Codex, etc.) can discover and load them.
 *
 * Runs automatically on `postinstall` or manually via:
 *   npx @wooksjs/event-wf setup-skills
 */

const fs = require('fs')
const path = require('path')

const SKILL_NAME = 'wooksjs-event-wf'

/* ── locate the project root (first dir above node_modules) ──────── */
function findProjectRoot() {
  let dir = __dirname
  while (dir !== path.dirname(dir)) {
    dir = path.dirname(dir)
    if (path.basename(dir) === 'node_modules') {
      return path.dirname(dir)
    }
  }
  return process.cwd()
}

const projectRoot = findProjectRoot()
const srcDir = path.join(__dirname, '..', 'skills', SKILL_NAME)
const agents = [
  { dir: '.claude', file: 'SKILL.md' },
  { dir: '.cursor', file: 'SKILL.md' },
  { dir: '.windsurf', file: 'SKILL.md' },
  { dir: '.codex', file: 'SKILL.md' },
]

/* ── copy skill files ────────────────────────────────────────────── */
function copySkills() {
  if (!fs.existsSync(srcDir)) {
    console.log(`[${SKILL_NAME}] skills source not found, skipping.`)
    return
  }

  const files = fs.readdirSync(srcDir)
  let copied = 0

  for (const agent of agents) {
    const destDir = path.join(projectRoot, agent.dir, 'skills', SKILL_NAME)
    fs.mkdirSync(destDir, { recursive: true })

    for (const file of files) {
      const src = path.join(srcDir, file)
      const dest = path.join(destDir, file)
      if (fs.statSync(src).isFile()) {
        fs.copyFileSync(src, dest)
        copied++
      }
    }
  }

  console.log(`[${SKILL_NAME}] copied ${files.length} skill files to ${agents.length} agent dirs (${copied} total).`)
}

try {
  copySkills()
} catch (err) {
  // Non-fatal — don't break installs
  console.log(`[${SKILL_NAME}] skill setup skipped: ${err.message}`)
}
