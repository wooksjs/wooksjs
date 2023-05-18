export interface TCliEventData {
    argv: string[]
    pathParams: string[]
    type: 'CLI'
}

export interface TCliContextStore {
    flags?: {
        [name: string]: boolean | string
    }
}
