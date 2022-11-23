import { createEventContext, useEventContext } from '@wooksjs/context-core'
import { THttpContextStore, THttpEventData } from './types'

export function createHttpContext(data: THttpEventData) {
    return createEventContext<THttpContextStore>({
        event: {
            ...data,
            type: 'HTTP',
        },
    })
}

export function useHttpContext<T extends object>() {
    return useEventContext<THttpContextStore & T>('HTTP')
}
