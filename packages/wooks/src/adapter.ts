import { TWooksHandler } from './types'

export type TWooksLookupArgs = { method?: string, url?: string }
export type TWooksLookupHandlers = TWooksHandler[]

export interface TWooksSubscribeAdapter {

    subscribe(lookup: (route: TWooksLookupArgs) => TWooksLookupHandlers | null): Promise<void> | void

}
