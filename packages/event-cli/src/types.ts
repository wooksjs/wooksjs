import type { CliHelpRenderer } from '@prostojs/cli-help'
import type { TProstoRouterPathHandle } from '@prostojs/router'
import type minimist from 'minimist'
import type { TWooksHandler } from 'wooks'

/** Event data describing a CLI command invocation. */
export interface TCliEventData {
  argv: string[]
  pathParams: string[]
  command: string
  opts?: minimist.Opts
  type: 'CLI'
  cliHelp: TCliHelpRenderer
}

/** Context store for CLI events, holding parsed flags. */
export interface TCliContextStore {
  flags?: Record<string, boolean | string>
}

/** Custom data attached to CLI help entries for handler resolution. */
export interface TCliHelpCustom {
  handler: TWooksHandler<any>
  /**
   * ### Callback for registered path
   *
   * @param path registered path
   * @param aliasType 0 - direct command, 1 - direct alias, 2 - computed alias
   */
  cb?: <T>(path: string, aliasType: number, route?: TProstoRouterPathHandle<T>) => void
}
/** CLI help renderer type parameterized with custom help data. */
export type TCliHelpRenderer = CliHelpRenderer<TCliHelpCustom>
