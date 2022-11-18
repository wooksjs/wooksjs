import { __dirname, packages } from './utils.js'
import execa from 'execa'
import path from 'path'
import minimist from 'minimist'
const args = minimist(process.argv.slice(2))

const target = args._ && args._[0] || 'wooks'

const alias = {

}

packages.forEach(({ name, shortName }) => {
    alias[name] = path.join(__dirname, '..', 'packages', shortName, 'dist', 'index.mjs')
})

async function run() {
    await execa(
        'npx',
        [
            'jiti',
            `./explorations/${target}/`,
        ],
        {
            stdio: 'inherit',
            env: {
                // JITI_DEBUG: 'true',
                JITI_ALIAS: JSON.stringify(alias),
            }
        }
    )
}

run()
