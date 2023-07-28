import {
    TEmpty,
    TEventOptions,
    createEventContext,
    useEventContext,
} from '@wooksjs/event-core'
import { TWFContextStore, TWFEventData } from './types'

export function createWfContext(
    data: Omit<TWFEventData, 'type'>,
    options: TEventOptions
) {
    return createEventContext<TWFContextStore, TWFEventData>({
        event: {
            ...data,
            type: 'WF',
        },
        resume: false,
        options,
    })
}

export function resumeWfContext(
    data: Omit<TWFEventData, 'type'>,
    options: TEventOptions
) {
    return createEventContext<TWFContextStore, TWFEventData>({
        event: {
            ...data,
            type: 'WF',
        },
        resume: true,
        options,
    })
}

/**
 * Wrapper on top of useEventContext that provides
 * proper context types for WF event
 * @returns set of hooks { getCtx, restoreCtx, clearCtx, hookStore, getStore, setStore }
 */
export function useWFContext<T extends TEmpty>() {
    return useEventContext<TWFContextStore & T, TWFEventData>('CLI')
}
