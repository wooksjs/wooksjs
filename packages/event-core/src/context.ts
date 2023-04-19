import { attachHook } from './hook'
import { TProstoLoggerOptions } from '@prostojs/logger'
import { TEventLoggerData } from './event-logger'
import { TEmpty, TGenericEvent } from './types'

export interface TEventOptions {
    eventLogger?: { topic?: string } & TProstoLoggerOptions<TEventLoggerData>
}

export type TGenericContextStore<CustomEventType = TEmpty> = {
    event: CustomEventType & TGenericEvent
    options: TEventOptions
    routeParams?: Record<string, string | string[]>
}

let currentContext: TGenericContextStore | null = null

/**
 * Create a new event context
 * 
 * @param data 
 * @returns set of hooks { getCtx, restoreCtx, clearCtx, hookStore, getStore, setStore }
 */
export function createEventContext<S = TEmpty, EventTypeToCreate = TEmpty>(data: S & TGenericContextStore<EventTypeToCreate>) {
    const newContext = { ...data }
    currentContext = newContext
    return _getCtxHelpers<S & TGenericContextStore<EventTypeToCreate>>(newContext)
}

/**
 * Use existing event context
 * 
 * !Must be called syncronously while context is reachable
 * 
 * @returns set of hooks { getCtx, restoreCtx, clearCtx, hookStore, getStore, setStore }
 */
export function useEventContext<S = TEmpty, EventType = TEmpty>(expectedTypes?: string | string[]) {
    if (!currentContext) {
        throw new Error('Event context does not exist. Use event context synchronously within the runtime of the event.')
    }
    const cc = currentContext as (S & TGenericContextStore<EventType>)
    if (expectedTypes || typeof expectedTypes === 'string') {
        const type = cc.event?.type
        const types = typeof expectedTypes === 'string' ? [ expectedTypes ] : expectedTypes 
        if (!types.includes(type)) new Error(`Event context type mismatch: expected ${ types.map(t => `"${ t }"`).join(', ') }, received "${ type }"`)
    }
    
    return _getCtxHelpers(cc)
}

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
            set: v => set(key, v),
            get: () => get(key),
        })

        function init<K2 extends keyof Required<T>[K]>(key2: K2, getter: () => Required<Required<T>[K]>[K2]): Required<Required<T>[K]>[K2] {
            if (hasNested(key2)) return getNested(key2)
            return setNested(key2, getter())
        }

        function hook<K2 extends keyof Required<T>[K]>(key2: K2) {
            const obj = {
                value: null as Required<T>[K][K2],
                isDefined: null as unknown as boolean,
            }
            attachHook(obj, {
                set: v => setNested(key2, v as T[K][K2]),
                get: () => getNested(key2),
            })
            attachHook(obj, {
                get: () => hasNested(key2),
            }, 'isDefined')
            return obj
        }

        function setNested<K2 extends keyof Required<T>[K]>(key2: K2, v: Required<T[K]>[K2]) {
            if (typeof obj.value === 'undefined') {
                obj.value = {} as T[K]
            }
            obj.value[key2] = v
            return v
        }
        function delNested<K2 extends keyof Required<T>[K]>(key2: K2) {
            setNested(key2, undefined as Required<T[K]>[K2])
        }
        function getNested<K2 extends keyof Required<T>[K]>(key2: K2) { return (obj.value || {} as T[K])[key2] as Required<T>[K][K2] }
        function hasNested<K2 extends keyof Required<T>[K]>(key2: K2) { return typeof (obj.value || {} as T[K])[key2] !== 'undefined' }
        function entries() { return Object.entries((obj.value || {})) }
        function clear() { obj.value = {} as T[K] }
    
        return obj
    }

    /**
     * Get event context object
     * 
     * @returns whole context object
     */
    function getCtx(): typeof cc { return cc }

    /**
     * Get value of event store property
     * 
     * @param key property name
     * @returns value of property by name
     */
    function get<K extends keyof T>(key: K) { return getCtx()[key] }

    /**
     * Set value of event store property
     * 
     * @param key property name
     * @param v property value
     */
    function set<K extends keyof T>(key: K, v: T[K]) {
        (getCtx())[key] = v 
    }

    return {
        getCtx,
        restoreCtx: () => currentContext = cc as TGenericContextStore,
        clearCtx: () => cc === currentContext ? currentContext = null : null,
        store,
        getStore: get,
        setStore: set,
    }
}
