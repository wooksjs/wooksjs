import type { TEmpty, TEventOptions } from '@wooksjs/event-core'
import { createAsyncEventContext, useAsyncEventContext } from '@wooksjs/event-core'

import type { TCliContextStore, TCliEventData } from './types'

export function createCliContext(data: Omit<TCliEventData, 'type'>, options: TEventOptions) {
  return createAsyncEventContext<TCliContextStore, TCliEventData>({
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
  return useAsyncEventContext<TCliContextStore & T, TCliEventData>('CLI')
}
