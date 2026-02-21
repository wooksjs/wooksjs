export function attachHook<
  V = unknown,
  T extends object | Function = object,
  P extends PropertyKey = 'value',
>(
  target: T,
  opts: {
    get: () => V | undefined
    set?: (value: V) => void
  },
  name?: P,
): T & THook<V, P> {
  Object.defineProperty(target, name || 'value', {
    get: opts.get,
    set: opts.set,
  })
  return target as T & THook<V, P>
}

export type THook<T = string, K extends PropertyKey = 'value'> = Record<K, T>
