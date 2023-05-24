import {
    TEmpty,
    TEventOptions,
    createEventContext,
    useEventContext,
} from '@wooksjs/event-core'
import { TCliContextStore, TCliEventData } from './types'

export function createCliContext(
    data: Omit<TCliEventData, 'type'>,
    options: TEventOptions
) {
    return createEventContext<TCliContextStore, TCliEventData>({
        event: {
            ...data,
            type: 'CLI',
        },
        options,
    })
}

/**
 * Wrapper on top of useEventContext that provides
 * proper context types for CLI event
 * @returns set of hooks { getCtx, restoreCtx, clearCtx, hookStore, getStore, setStore }
 */
export function useCliContext<T extends TEmpty>() {
    return useEventContext<TCliContextStore & T, TCliEventData>('CLI')
}
