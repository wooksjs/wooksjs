import type { CliHelpRenderer } from '@prostojs/cli-help'
import type { TProstoRouterPathHandle } from '@prostojs/router'
import type minimist from 'minimist'
import type { TWooksHandler } from 'wooks'

export interface TCliEventData {
  argv: string[]
  pathParams: string[]
  command: string
  opts?: minimist.Opts
  type: 'CLI'
  cliHelp: TCliHelpRenderer
}

export interface TCliContextStore {
  flags?: Record<string, boolean | string>
}

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
export type TCliHelpRenderer = CliHelpRenderer<TCliHelpCustom>
