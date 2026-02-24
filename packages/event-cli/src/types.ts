import type { CliHelpRenderer } from '@prostojs/cli-help'
import type { TProstoRouterPathHandle } from '@prostojs/router'
import type { TWooksHandler } from 'wooks'

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
