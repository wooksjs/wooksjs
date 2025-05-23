import type { TCtxHelpers, TEmpty, TEventOptions, TGenericContextStore } from '@wooksjs/event-core'
import { createAsyncEventContext, useAsyncEventContext } from '@wooksjs/event-core'

import type { THttpContextStore, THttpEventData } from './types'

export function createHttpContext(data: THttpEventData, options: TEventOptions) {
  return createAsyncEventContext<THttpContextStore, THttpEventData>({
    event: {
      ...data,
      type: 'HTTP',
    },
    options,
  })
}

/**
 * Wrapper on useEventContext with HTTP event types
 * @returns set of hooks { getCtx, restoreCtx, clearCtx, hookStore, getStore, setStore }
 */
export function useHttpContext<T extends TEmpty>(): TCtxHelpers<
  THttpContextStore & T & TGenericContextStore<THttpEventData>
> {
  return useAsyncEventContext<THttpContextStore & T, THttpEventData>('HTTP')
}
