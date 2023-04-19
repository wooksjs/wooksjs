import { TEmpty, TEventOptions, createEventContext, useEventContext } from '@wooksjs/event-core'
import { TCliContextStore, TCliEventData } from './types'

export function createCliContext(data: TCliEventData, options: TEventOptions) {
    return createEventContext<TCliContextStore, TCliEventData>({
        event: {
            ...data,
            type: 'CLI',
        },
        options,
    })
}

export function useCliContext<T extends TEmpty>() {
    return useEventContext<TCliContextStore & T, TCliEventData>('CLI')
}
