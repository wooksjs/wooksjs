import { AsyncLocalStorage } from 'node:async_hooks'

import type { TProstoLoggerOptions } from '@prostojs/logger'

import { getContextInjector } from './context-injector'
import type { TEventLoggerData } from './event-logger'
import { attachHook } from './hook'
import type { TEmpty, TGenericEvent } from './types'

/** Configuration options for event context creation. */
export interface TEventOptions {
  eventLogger?: { topic?: string } & TProstoLoggerOptions<TEventLoggerData>
}

/** Shape of the context store that holds event data, options, and route params. */
export interface TGenericContextStore<CustomEventType = TEmpty> {
  event: CustomEventType & TGenericEvent
  options: TEventOptions
  parentCtx?: TGenericContextStore
  routeParams?: Record<string, string | string[]>
  _ended?: boolean
}

// let currentContext: TGenericContextStore | null = null

// --=========== ASYNC CONTEXT =============--

const STORAGE_KEY = Symbol.for('wooks.asyncStorage')
const VERSION_KEY = Symbol.for('wooks.asyncStorage.version')
const CURRENT_VERSION = '0.6.2'

const _g = globalThis as Record<symbol, unknown>
if (_g[STORAGE_KEY]) {
  if (_g[VERSION_KEY] !== CURRENT_VERSION) {
    // oxlint-disable-next-line no-console
    console.warn(
      `${__DYE_YELLOW__}[wooks] Multiple versions of @wooksjs/event-core detected: ` +
        `existing v${_g[VERSION_KEY] as string}, current v${CURRENT_VERSION}. ` +
        `Reusing existing asyncStorage to avoid runtime errors.${__DYE_RESET__}`,
    )
  }
} else {
  _g[STORAGE_KEY] = new AsyncLocalStorage<TGenericContextStore>()
  _g[VERSION_KEY] = CURRENT_VERSION
}

/**
 * AsyncLocalStorage instance
 *
 * Use on your own risk only if you know what you're doing
 */
export const asyncStorage = _g[STORAGE_KEY] as AsyncLocalStorage<TGenericContextStore>

/** Symbol key for caching store accessors directly on the context object */
const _storeCacheKey = Symbol('storeCache')
/** Symbol key for caching the full helpers object on the context */
const _helpersCacheKey = Symbol('helpersCache')

/**
 * Creates a new async event context and returns a runner function to execute callbacks within it.
 *
 * @param data - Initial context store data including the event object and options.
 * @returns A function that runs a callback within the created async context.
 */
export function createAsyncEventContext<S = TEmpty, EventTypeToCreate = TEmpty>(
  data: S & TGenericContextStore<EventTypeToCreate>,
): <T>(cb: (...a: unknown[]) => T) => T {
  const newContext = { ...data } as TGenericContextStore
  const cc = asyncStorage.getStore()
  if (cc && typeof cc === 'object' && cc.event?.type) {
    newContext.parentCtx = cc
  }
  const ci = getContextInjector()
  return <T>(cb: (...a: unknown[]) => T) =>
    asyncStorage.run(newContext, () =>
      ci.with('Event:start', { eventType: newContext.event.type }, cb),
    )
}

/**
 * Retrieves the current async event context and returns helpers for reading/writing the store.
 *
 * @param expectedTypes - Optional event type(s) to validate the context against.
 * @throws If no event context exists or if the event type does not match.
 */
export function useAsyncEventContext<S = TEmpty, EventType = TEmpty>(
  expectedTypes?: string | string[],
): TCtxHelpers<S & TGenericContextStore<EventType>> {
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
            .map((t) => `"${t}"`)
            .join(', ')}, received "${type}"`,
        )
      }
    }
  }

  return _getCtxHelpers<S & TGenericContextStore<EventType>>(cc)
}
// --=========== ASYNC CONTEXT =============--

/** Helper methods returned by `useAsyncEventContext` for interacting with the context store. */
export interface TCtxHelpers<T> {
  getCtx: () => T
  store: <K extends keyof Required<T>>(
    key: K,
  ) => {
    value: T[K]
    hook: <K2 extends keyof Required<T>[K]>(
      key2: K2,
    ) => {
      value: Required<T>[K][K2]
      isDefined: boolean
    }
    init: <K2 extends keyof Required<T>[K]>(
      key2: K2,
      getter: () => Required<Required<T>[K]>[K2],
    ) => Required<Required<T>[K]>[K2]
    set: <K2 extends keyof Required<T>[K]>(key2: K2, v: Required<T[K]>[K2]) => Required<T[K]>[K2]
    get: <K2 extends keyof Required<T>[K]>(key2: K2) => Required<T>[K][K2] | undefined
    has: <K2 extends keyof Required<T>[K]>(key2: K2) => boolean
    del: <K2 extends keyof Required<T>[K]>(key2: K2) => void
    entries: () => Array<[string, unknown]>
    clear: () => void
  }
  getStore: <K extends keyof T>(key: K) => T[K]
  setStore: <K extends keyof T>(key: K, v: T[K]) => void
  setParentCtx: (parentCtx: unknown) => void
  hasParentCtx: () => boolean
  getParentCtx: <T2 = T>() => TCtxHelpers<T2>
}

function _getCtxHelpers<T>(cc: T): TCtxHelpers<T> {
  const ccRec = cc as Record<symbol, unknown>
  // Fast path: return cached helpers for this context
  if (ccRec[_helpersCacheKey]) {
    return ccRec[_helpersCacheKey] as TCtxHelpers<T>
  }
  if (!ccRec[_storeCacheKey]) {
    ccRec[_storeCacheKey] = new Map<PropertyKey, unknown>()
  }
  const _storeCache = ccRec[_storeCacheKey] as Map<PropertyKey, unknown>

  /**
   * Hook to an event store property
   *
   * @param key store property key
   * @returns a hook { value: <prop value>, hook: (key2: keyof <prop value>) => { value: <nested prop value> }, ... }
   */
  function store<K extends keyof Required<T>>(key: K) {
    const cachedStore = _storeCache.get(key as PropertyKey)
    if (cachedStore) {
      // oxlint-disable-next-line no-explicit-any -- type-erased generic cache
      return cachedStore as any
    }

    // --- Optimization 3: direct cc[key] access for internal operations ---
    const getSection = () => (cc as Record<PropertyKey, unknown>)[key as PropertyKey] as T[K]
    const setSection = (v: T[K]) => {
      ;(cc as Record<PropertyKey, unknown>)[key as PropertyKey] = v
    }

    const _hookCache = new Map<PropertyKey, unknown>()

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

    // .value hook preserved for external consumer API
    attachHook(obj, {
      set: (v) => {
        setSection(v)
      },
      get: () => getSection(),
    })

    function init<K2 extends keyof Required<T>[K]>(
      key2: K2,
      getter: () => Required<Required<T>[K]>[K2],
    ): Required<Required<T>[K]>[K2] {
      if (hasNested(key2)) {
        return getNested(key2) as Required<Required<T>[K]>[K2]
      }
      return setNested(key2, getter())
    }

    function hook<K2 extends keyof Required<T>[K]>(key2: K2) {
      const hookKey = key2 as PropertyKey
      const cached = _hookCache.get(hookKey)
      if (cached) {
        // oxlint-disable-next-line no-explicit-any -- type-erased generic cache
        return cached as any
      }
      const hookObj = {
        value: null as Required<T>[K][K2],
        isDefined: null as unknown as boolean,
      }
      attachHook(hookObj, {
        set: (v) => setNested(key2, v as T[K][K2]),
        get: () => getNested(key2),
      })
      attachHook(
        hookObj,
        {
          get: () => hasNested(key2),
        },
        'isDefined',
      )
      _hookCache.set(hookKey, hookObj)
      return hookObj
    }

    function setNested<K2 extends keyof Required<T>[K]>(key2: K2, v: Required<T[K]>[K2]) {
      let section = getSection()
      if (section === undefined) {
        section = {} as T[K]
        setSection(section)
      }
      ;(section as Record<PropertyKey, unknown>)[key2 as PropertyKey] = v
      return v
    }
    function delNested<K2 extends keyof Required<T>[K]>(key2: K2) {
      setNested(key2, undefined as Required<T[K]>[K2])
    }
    // --- Optimization 4: no empty object allocation on fallback ---
    function getNested<K2 extends keyof Required<T>[K]>(key2: K2) {
      const section = getSection()
      // oxlint-disable-next-line no-negated-condition
      return (section !== undefined ? (section as Record<PropertyKey, unknown>)[key2 as PropertyKey] : undefined) as
        | Required<T>[K][K2]
        | undefined
    }
    function hasNested<K2 extends keyof Required<T>[K]>(key2: K2) {
      const section = getSection()
      // oxlint-disable-next-line no-negated-condition
      return section !== undefined ? (section as Record<PropertyKey, unknown>)[key2 as PropertyKey] !== undefined : false
    }
    function entries() {
      const section = getSection()
      return section ? Object.entries(section) : []
    }
    function clear() {
      setSection({} as T[K])
    }

    _storeCache.set(key as PropertyKey, obj)
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

  // --- Optimization 5: inline cc access in get/set ---
  function get<K extends keyof T>(key: K) {
    return cc[key]
  }

  function set<K extends keyof T>(key: K, v: T[K]) {
    cc[key] = v
  }

  const hasParentCtx = () => !!(cc as TGenericContextStore).parentCtx

  const helpers: TCtxHelpers<T> = {
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

  ccRec[_helpersCacheKey] = helpers
  return helpers
}
