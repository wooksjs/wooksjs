import type { TEmpty, TEventOptions } from '@wooksjs/event-core'
import { createEventContext, useEventContext } from '@wooksjs/event-core'

import type { THttpContextStore, THttpEventData } from './types'

export function createHttpContext(data: THttpEventData, options: TEventOptions) {
  return createEventContext<THttpContextStore, THttpEventData>({
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
export function useHttpContext<T extends TEmpty>() {
  return useEventContext<THttpContextStore & T, THttpEventData>('HTTP')
}
