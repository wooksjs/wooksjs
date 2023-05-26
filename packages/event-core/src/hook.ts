export function attachHook<
    V = unknown,
    // eslint-disable-next-line @typescript-eslint/ban-types
    T extends object | Function = object,
    P extends PropertyKey = 'value'
>(
    target: T,
    opts: {
        get: () => V | undefined
        set?: (value: V) => void
    },
    name?: P
) {
    Object.defineProperty(target, name || 'value', {
        get: opts.get,
        set: opts.set,
    })
    return target as (T & THook<V, P>)
}

export type THook<T = string, K extends PropertyKey = 'value'> = {
    [key in K]: T
}
