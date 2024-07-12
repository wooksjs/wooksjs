/* eslint-disable @typescript-eslint/no-unsafe-return */
import { AsyncLocalStorage } from 'node:async_hooks'

import type { TProstoLoggerOptions } from '@prostojs/logger'

import { getContextInjector } from './context-injector'
import type { TEventLoggerData } from './event-logger'
import { attachHook } from './hook'
import type { TEmpty, TGenericEvent } from './types'

export interface TEventOptions {
  eventLogger?: { topic?: string } & TProstoLoggerOptions<TEventLoggerData>
}

export interface TGenericContextStore<CustomEventType = TEmpty> {
  event: CustomEventType & TGenericEvent
  options: TEventOptions
  parentCtx?: TGenericContextStore
  routeParams?: Record<string, string | string[]>
  _ended?: boolean
}

// let currentContext: TGenericContextStore | null = null

// --=========== ASYNC CONTEXT =============--

/**
 * AsyncLocalStorage instance
 *
 * Use on your own risk only if you know what you're doing
 */
export const asyncStorage = new AsyncLocalStorage()

export function createAsyncEventContext<S = TEmpty, EventTypeToCreate = TEmpty>(
  data: S & TGenericContextStore<EventTypeToCreate>
) {
  const newContext = { ...data }
  const ci = getContextInjector()
  return <T>(cb: (...a: any[]) => T) =>
    asyncStorage.run(newContext, () =>
      ci.with('Event:start', { eventType: newContext.event.type }, cb)
    )
}

export function useAsyncEventContext<S = TEmpty, EventType = TEmpty>(
  expectedTypes?: string | string[]
) {
  let cc = asyncStorage.getStore() as (S & TGenericContextStore<EventType>) | undefined
  if (!cc) {
    throw new Error('Event context does not exist at this point.')
  }
  if (expectedTypes || typeof expectedTypes === 'string') {
    const type = cc.event.type
    const types = typeof expectedTypes === 'string' ? [expectedTypes] : expectedTypes
    if (!types.includes(type)) {
      if (cc.parentCtx?.event.type && types.includes(cc.parentCtx.event.type)) {
        cc = cc.parentCtx as S & TGenericContextStore<EventType>
      } else {
        throw new Error(
          `Event context type mismatch: expected ${types
            .map(t => `"${t}"`)
            .join(', ')}, received "${type}"`
        )
      }
    }
  }

  return _getCtxHelpers(cc)
}

// --=========== ASYNC CONTEXT =============--

/**
 *
 * @param cc
 * @returns
 */
function _getCtxHelpers<T>(cc: T) {
  /**
   * Hook to an event store property
   *
   * @param key store property key
   * @returns a hook { value: <prop value>, hook: (key2: keyof <prop value>) => { value: <nested prop value> }, ... }
   */
  function store<K extends keyof Required<T>>(key: K) {
    const obj = {
      value: null as T[K],
      hook,
      init,
      set: setNested,
      get: getNested,
      has: hasNested,
      del: delNested,
      entries,
      clear,
    }

    attachHook(obj, {
      set: v => {
        set(key, v)
      },
      get: () => get(key),
    })

    function init<K2 extends keyof Required<T>[K]>(
      key2: K2,
      getter: () => Required<Required<T>[K]>[K2]
    ): Required<Required<T>[K]>[K2] {
      if (hasNested(key2)) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return getNested(key2)!
      }
      return setNested(key2, getter())
    }

    function hook<K2 extends keyof Required<T>[K]>(key2: K2) {
      // eslint-disable-next-line @typescript-eslint/no-shadow
      const obj = {
        value: null as Required<T>[K][K2],
        isDefined: null as unknown as boolean,
      }
      attachHook(obj, {
        set: v => setNested(key2, v as T[K][K2]),
        get: () => getNested(key2),
      })
      attachHook(
        obj,
        {
          get: () => hasNested(key2),
        },
        'isDefined'
      )
      return obj
    }

    function setNested<K2 extends keyof Required<T>[K]>(key2: K2, v: Required<T[K]>[K2]) {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (obj.value === undefined) {
        obj.value = {} as T[K]
      }
      obj.value[key2] = v
      return v
    }
    function delNested<K2 extends keyof Required<T>[K]>(key2: K2) {
      setNested(key2, undefined as Required<T[K]>[K2])
    }
    function getNested<K2 extends keyof Required<T>[K]>(key2: K2) {
      return (obj.value || ({} as T[K]))[key2] as Required<T>[K][K2] | undefined
    }
    function hasNested<K2 extends keyof Required<T>[K]>(key2: K2) {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      return (obj.value || ({} as T[K]))[key2] !== undefined
    }
    function entries() {
      return Object.entries(obj.value || {})
    }
    function clear() {
      obj.value = {} as T[K]
    }

    return obj
  }

  /**
   * Get event context object
   *
   * @returns whole context object
   */
  function getCtx(): typeof cc {
    return cc
  }

  /**
   * Get value of event store property
   *
   * @param key property name
   * @returns value of property by name
   */
  function get<K extends keyof T>(key: K) {
    return getCtx()[key]
  }

  /**
   * Set value of event store property
   *
   * @param key property name
   * @param v property value
   */
  function set<K extends keyof T>(key: K, v: T[K]) {
    getCtx()[key] = v
  }

  const hasParentCtx = () => !!(cc as TGenericContextStore).parentCtx

  return {
    getCtx,
    store,
    getStore: get,
    setStore: set,
    setParentCtx: (parentCtx: unknown) => {
      ;(cc as { parentCtx: unknown }).parentCtx = parentCtx
    },
    hasParentCtx,
    getParentCtx: <T2 = T>() => {
      if (!hasParentCtx()) {
        throw new Error('Parent context is not available')
      }
      return _getCtxHelpers((cc as { parentCtx: T2 }).parentCtx)
    },
  }
}
