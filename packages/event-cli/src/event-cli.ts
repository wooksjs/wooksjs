import { createEventContext, useEventContext } from '@wooksjs/event-core'
import { TCliContextStore, TCliEventData } from './types'

export function createCliContext(data: TCliEventData) {
    return createEventContext<TCliContextStore>({
        event: {
            ...data,
            type: 'CLI',
        },
    })
}

export function useCliContext<T extends object>() {
    return useEventContext<TCliContextStore & T>('CLI')
}
