/**
 * Attaches a getter/setter hook to a target object property via `Object.defineProperty`.
 *
 * @param target - The object to attach the hook to.
 * @param opts - Getter and optional setter for the hooked property.
 * @param name - Property name to hook (defaults to `'value'`).
 */
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

/** A record type representing a hooked property on an object. */
export type THook<T = string, K extends PropertyKey = 'value'> = Record<K, T>
