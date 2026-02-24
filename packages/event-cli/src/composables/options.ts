import { current } from '@wooksjs/event-core'
import minimist from 'minimist'

import { cliKind, flagsKey } from '../cli-kind'
import { useCliHelp } from './cli-help'

/**
 * Get CLI Options
 *
 * @returns an object with CLI options
 */
export function useCliOptions() {
  const ctx = current()
  if (!ctx.has(flagsKey)) {
    const argv = ctx.get(cliKind.keys.argv)
    const opts = ctx.get(cliKind.keys.opts)
    ctx.set(flagsKey, minimist(argv, opts))
  }
  return ctx.get(flagsKey)
}

/**
 * Getter for Cli Option value
 *
 * @param name name of the option
 * @returns value of a CLI option
 * @example
 * ```ts
 * const verbose = useCliOption('verbose')
 * if (verbose) {
 *   console.log('Verbose mode enabled')
 * }
 * ```
 */
export function useCliOption(name: string) {
  try {
    const options = useCliHelp().getEntry().options || []
    const opt = options.find((o) => o.keys.includes(name))
    if (opt) {
      for (const key of opt.keys) {
        if (useCliOptions()[key]) {
          return useCliOptions()[key]
        }
      }
    }
  } catch {
    //
  }
  return useCliOptions()[name]
}
