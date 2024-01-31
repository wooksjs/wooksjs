import execa from 'execa'
import minimist from 'minimist'
import path from 'path'

import { __dirname, packages } from './utils.js'

const args = minimist(process.argv.slice(2))

const target = typeof args.dev === 'string' ? args.dev : (args._ && args._[0]) || 'wooks'

const alias = {
  common: path.join(__dirname, '..', 'common'),
}

const origArgs = process.argv.slice(2)
const passIndex = origArgs.findIndex(a => a == '--') + 1
let toPass = []
if (passIndex) {
  toPass = origArgs.slice(passIndex)
}

packages.forEach(({ name, shortName }) => {
  alias[name] = args.dev
    ? path.join(__dirname, '..', 'packages', shortName, 'src', 'index.ts')
    : path.join(__dirname, '..', 'packages', shortName, 'dist', 'index.mjs')
})

async function run() {
  await execa('npx', ['jiti', `./explorations/${target}/`, ...toPass], {
    stdio: 'inherit',
    env: {
      // JITI_DEBUG: 'true',
      JITI_ALIAS: JSON.stringify(alias),
    },
  })
}

run()
