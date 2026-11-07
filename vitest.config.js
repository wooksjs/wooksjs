/* eslint-disable unicorn/no-abusive-eslint-disable */
/* eslint-disable */
import { defineConfig } from 'vitest/config'
import { createDyeReplacements } from '@prostojs/dye/common'
import { templatePlugin } from './scripts/template.plugin'
const define = createDyeReplacements()
for (const key of Object.keys(define)) {
  define[key] = '""'
}
define.__VERSION__ = '"0.1.2"'
export default defineConfig({
  define,
  plugins: [templatePlugin()],
  test: {
    // Type contracts: `*.types.spec.ts` are checked by tsc (an unused `@ts-expect-error` fails).
    // Runtime specs are not type-checked: pin type rules in a `*.types.spec.ts`.
    typecheck: {
      enabled: true,
      tsconfig: './tsconfig.typecheck.json',
      include: ['packages/*/src/**/*.types.spec.ts'],
    },
  },
})
