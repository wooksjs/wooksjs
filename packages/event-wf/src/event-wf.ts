import type { TEmpty, TEventOptions } from '@wooksjs/event-core'
import { createAsyncEventContext, useAsyncEventContext } from '@wooksjs/event-core'

import type { TWFContextStore, TWFEventData } from './types'

export function createWfContext(data: Omit<TWFEventData, 'type'>, options: TEventOptions) {
  return createAsyncEventContext<TWFContextStore, TWFEventData>({
    event: {
      ...data,
      type: 'WF',
    },
    resume: false,
    options,
  })
}

export function resumeWfContext(data: Omit<TWFEventData, 'type'>, options: TEventOptions) {
  return createAsyncEventContext<TWFContextStore, TWFEventData>({
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
  return useAsyncEventContext<TWFContextStore & T, TWFEventData>('WF')
}
