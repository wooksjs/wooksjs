import { TGenericEvent, TGenericContextStore } from '@wooksjs/context-core'

export interface TCliEventData {
    argv: string[]
}

export interface TCliEvent extends TGenericEvent, TCliEventData {
    type: 'CLI'
}

export interface TCliContextStore extends TGenericContextStore<TCliEvent> {
    flags?: {
        [name: string]: boolean | string
    }
    rootCmd?: string
}
