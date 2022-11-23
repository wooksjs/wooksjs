import { panic } from 'common/panic'
import { attachHook } from './hook'

export interface TGenericEvent {
    type: string
}

export type TGenericContextStore<E extends TGenericEvent = TGenericEvent> = {
    event: E
    routeParams?: Record<string, string | string[]>
}

let currentContext: TGenericContextStore | null = null

/**
 * Create a new event context
 * 
 * @param data 
 * @returns set of hooks { getCtx, restoreCtx, clearCtx, hookStore, getStore, setStore }
 */
export function createEventContext<S extends TGenericContextStore>(data: S) {
    const newContext = { ...data }
    currentContext = newContext
    return _getCtxHelpers<S>(newContext)
}

/**
 * Use existing event context
 * 
 * !Must be called syncronously while context is reachable
 * 
 * @returns set of hooks { getCtx, restoreCtx, clearCtx, hookStore, getStore, setStore }
 */
export function useEventContext<S extends TGenericContextStore>(expectedTypes?: string | string[]) {
    if (!currentContext) {
        throw panic('Event context does not exist. Use event context synchronously within the runtime of the event.')
    }
    const cc = currentContext as S
    if (expectedTypes || typeof expectedTypes === 'string') {
        const type = cc.event?.type
        const types = typeof expectedTypes === 'string' ? [ expectedTypes ] : expectedTypes 
        if (!types.includes(type)) panic(`Event context type mismatch: expected ${ types.map(t => `"${ t }"`).join(', ') }, received "${ type }"`)
    }
    
    return _getCtxHelpers<S>(cc)
}

function _getCtxHelpers<S extends TGenericContextStore>(cc: S) {

    /**
     * Hook to an event store property
     * 
     * @param key store property key
     * @returns a hook { value: <prop value>, hook: (key2: keyof <prop value>) => { value: <nested prop value> }, ... }
     */
    function store<K extends keyof Required<S>>(key: K) {
        const obj = {
            value: null as S[K],
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

        function init<K2 extends keyof Required<S>[K]>(key2: K2, getter: () => Required<Required<S>[K]>[K2]): Required<Required<S>[K]>[K2] {
            if (hasNested(key2)) return getNested(key2)
            return setNested(key2, getter())
        }

        function hook<K2 extends keyof Required<S>[K]>(key2: K2) {
            const obj = {
                value: null as Required<S>[K][K2],
                isDefined: null as unknown as boolean
            }
            attachHook(obj, {
                set: v => setNested(key2, v as S[K][K2]),
                get: () => getNested(key2),
            })
            attachHook(obj, {
                get: () => hasNested(key2),
            }, 'isDefined')
            return obj
        }

        function setNested<K2 extends keyof Required<S>[K]>(key2: K2, v: Required<S[K]>[K2]) {
            if (typeof obj.value === 'undefined') {
                obj.value = {} as S[K]
            }
            obj.value[key2] = v
            return v
        }
        function delNested<K2 extends keyof Required<S>[K]>(key2: K2) {
            setNested(key2, undefined as Required<S[K]>[K2])
        }
        function getNested<K2 extends keyof Required<S>[K]>(key2: K2) { return (obj.value || {} as S[K])[key2] as Required<S>[K][K2] }
        function hasNested<K2 extends keyof Required<S>[K]>(key2: K2) { return typeof (obj.value || {} as S[K])[key2] !== 'undefined' }
        function entries() { return Object.entries((obj.value || {})) }
        function clear() { obj.value = {} as S[K] }
    
        return obj
    }

    /**
     * Get event context object
     * 
     * @returns whole context object
     */
    function getCtx() { return cc as S }

    /**
     * Get value of event store property
     * 
     * @param key property name
     * @returns value of property by name
     */
    function get<K extends keyof S>(key: K) { return getCtx()[key] }

    /**
     * Set value of event store property
     * 
     * @param key property name
     * @param v property value
     */
    function set<K extends keyof S>(key: K, v: S[K]) {
        (getCtx() as S)[key] = v 
    }

    return {
        getCtx,
        restoreCtx: () => currentContext = cc,
        clearCtx: () => currentContext = null,
        store,
        getStore: get,
        setStore: set,
    }
}
