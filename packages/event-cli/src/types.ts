import { CliHelpRenderer } from '@prostojs/cli-help'
import { TWooksHandler } from '@wooksjs/wooks'

export interface TCliEventData {
    argv: string[]
    pathParams: string[]
    command: string
    type: 'CLI'
    cliHelp: TCliHelpRenderer
}

export interface TCliContextStore {
    flags?: {
        [name: string]: boolean | string
    }
}

export type TCliHelpCustom = {
    handler: TWooksHandler<any>
    /**
     * ### Callback for registered path
     *
     * @param path registered path
     * @param aliasType 0 - direct command, 1 - direct alias, 2 - computed alias
     */
    cb?: (path: string, aliasType: number) => void
}
export type TCliHelpRenderer = CliHelpRenderer<TCliHelpCustom>
