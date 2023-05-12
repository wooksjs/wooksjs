import {
    TEmpty,
    TEventOptions,
    createEventContext,
    useEventContext,
} from '@wooksjs/event-core'
import { THttpContextStore, THttpEventData } from './types'

export function createHttpContext(
    data: THttpEventData,
    options: TEventOptions
) {
    return createEventContext<THttpContextStore, THttpEventData>({
        event: {
            ...data,
            type: 'HTTP',
        },
        options,
    })
}

export function useHttpContext<T extends TEmpty>() {
    return useEventContext<THttpContextStore & T, THttpEventData>('HTTP')
}
