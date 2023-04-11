import { TEventOptions, createEventContext, useEventContext } from '@wooksjs/event-core'
import { TCliContextStore, TCliEventData } from './types'

export function createCliContext(data: TCliEventData, options: TEventOptions) {
    return createEventContext<TCliContextStore>({
        event: {
            ...data,
            type: 'CLI',
        },
        options,
    })
}

export function useCliContext<T extends object>() {
    return useEventContext<TCliContextStore & T>('CLI')
}
