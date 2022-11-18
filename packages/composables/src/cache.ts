import { useWooksCtx } from './core'

export function useCacheStore<T extends object = Record<string | symbol, unknown>>(name: string | symbol) {
    const ctxCache = useWooksCtx().getCtx().cache
    ctxCache[name] = (ctxCache[name] || {}) as Partial<T>
    const getAll = () => ctxCache[name] as Partial<T>
    const get = <A extends keyof Required<T>>(propName: A) => getAll()[propName]
    const has = <A extends keyof T>(propName: A) => typeof getAll()[propName] !== 'undefined'
    const set = <A extends keyof Required<T>>(propName: A, v: Required<T>[A]) => getAll()[propName] = v
    const del = <A extends keyof Required<T>>(propName: A) => getAll()[propName] = undefined
    const clear = () => ctxCache[name] = {}
    const entries = () => Object.entries(getAll())
    return {
        get,
        getAll,
        has,
        set,
        del,
        clear,
        entries,
    }
}
