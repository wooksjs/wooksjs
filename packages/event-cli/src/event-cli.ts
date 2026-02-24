import { EventContext, current, run } from '@wooksjs/event-core'
import type { EventContextOptions } from '@wooksjs/event-core'
import type minimist from 'minimist'

import { cliKind } from './cli-kind'
import type { TCliHelpRenderer } from './types'

export interface TCliEventInput {
  argv: string[]
  pathParams: string[]
  command: string
  opts?: minimist.Opts
  cliHelp: TCliHelpRenderer
}

/** Creates a new event context for a CLI command invocation. */
export function createCliContext(data: TCliEventInput, options: EventContextOptions) {
  const ctx = new EventContext(options)
  return <R>(fn: () => R): R =>
    run(ctx, () =>
      ctx.attach(
        cliKind,
        {
          argv: data.argv,
          pathParams: data.pathParams,
          command: data.command,
          opts: data.opts,
          cliHelp: data.cliHelp,
        },
        fn,
      ),
    )
}
