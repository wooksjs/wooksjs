import { TEventOptions, createEventContext, useEventContext } from '@wooksjs/event-core'
import { THttpContextStore, THttpEventData } from './types'

export function createHttpContext(data: THttpEventData, options: TEventOptions) {
    return createEventContext<THttpContextStore>({
        event: {
            ...data,
            type: 'HTTP',
        },
        options,
    })
}

export function useHttpContext<T extends object>() {
    return useEventContext<THttpContextStore & T>('HTTP')
}
