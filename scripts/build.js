#!/usr/bin/env

import 'zx/globals'
import { getExternals, getWorkspaceFolders } from './utils.js'
import { dye } from '@prostojs/dye'
import { rollup } from 'rollup'
import { rolldown } from 'rolldown'
import dyePlugin from '@prostojs/dye/rolldown'
import dts from 'rollup-plugin-dts'
import { writeFileSync } from 'fs'
import pkg from '../package.json' assert { type: 'json' }
let i = 1

const info = dye('blue').attachConsole()
const step = dye('cyan').prefix(() => `\n${i++}. `).attachConsole()
const done = dye('green').prefix(() => ` ✅ `).attachConsole()
const file = dye('blue', 'bold')

const target = process.argv[2]

// $.verbose = true
const workspaces = target ? getWorkspaceFolders().filter(t => t === target) : getWorkspaceFolders()
if (!workspaces.length) {
    console.error(`No workspaces found`)
    process.exit(1)
}
const externals = new Map()
for (const ws of workspaces) {
    externals.set(ws, getExternals(ws))
}

async function run() {
    console.log()
    if (target) {
        info(`Target: ${dye('bold')(target)}`)
        console.log()
    }
    await generateTypes()
    await generateBundles()
}
run()

async function generateTypes() {
    step('Generating Types')
    await $`npx tsc`.nothrow()

    for (const ws of workspaces) {
        await $`mkdir -p ./packages/${ws}/dist && rsync -a ./.types/${ws}/src/ ./packages/${ws}/dist --delete`
    }
    for (const ws of workspaces) {
        await rollupTypes(ws)
    }

    await $`rm -rf ./.types`
}

const ESM = { format: 'esm' }
const CJS = { format: 'cjs' }

async function rollupTypes(ws) {
    const inputOptions = {
        input: `packages/${ws}/dist/index.d.ts`,
        plugins: [dts()],
        external: externals.get(ws),
    }
    const bundle = await rollup(inputOptions)
    const { output } = await bundle.generate(ESM);
    await $`rm -rf ./packages/${ws}/dist`
    await $`mkdir -p ./packages/${ws}/dist`
    const target = `./packages/${ws}/dist/index.d.ts`
    writeFileSync(target, output[0].code)
    done(`Created ${file(target)}`)
}

async function generateBundles() {
    step('Rolldown Bundles')
    for (const ws of workspaces) {
        rolldownPackages(ws)
    }
}

const dplg = dyePlugin()
async function rolldownPackages(ws) {
    const inputOptions = {
        input: `packages/${ws}/src/index.ts`,
        external: externals.get(ws),
        define: {
            __VERSION__: JSON.stringify(pkg.version),
        },
        plugins: [dplg],
    }
    const bundle = await rolldown(inputOptions)
    const { output: esOut } = await bundle.generate(ESM);
    const { output: cjsOut } = await bundle.generate(CJS);
    await $`mkdir -p ./packages/${ws}/dist`
    const esTarget = `./packages/${ws}/dist/index.mjs`
    writeFileSync(esTarget, esOut[0].code)
    const cjsTarget = `./packages/${ws}/dist/index.cjs`
    writeFileSync(cjsTarget, cjsOut[0].code)
    done(`MJS ${file(esTarget)} \tCJS ${file(cjsTarget)}`)
}
