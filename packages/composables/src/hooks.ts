// eslint-disable-next-line @typescript-eslint/ban-types
export function attachHook<V = unknown, T extends (object | Function) = object, P extends PropertyKey = 'value'>(
    target: T,
    opts: {
        get: () => V | undefined,
        set: (value: V) => void
    },
    name?: P,
) {
    Object.defineProperty(target, name || 'value', {
        get: opts.get,
        set: opts.set,
    })
    return target as (T & {
        [name in P]?: V
    })
}
