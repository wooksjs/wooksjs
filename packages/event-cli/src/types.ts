export interface TCliEventData {
    argv: string[]
    type: 'CLI'
}

export interface TCliContextStore {
    flags?: {
        [name: string]: boolean | string
    }
}
