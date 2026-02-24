import { defineEventKind, key, slot } from '@wooksjs/event-core'
import type minimist from 'minimist'

import type { TCliHelpRenderer } from './types'

export const cliKind = defineEventKind('CLI', {
  argv: slot<string[]>(),
  pathParams: slot<string[]>(),
  command: slot<string>(),
  opts: slot<minimist.Opts | undefined>(),
  cliHelp: slot<TCliHelpRenderer>(),
})

export const flagsKey = key<Record<string, boolean | string>>('cli.flags')
