import { cached } from './key';
import { current } from './storage';
import type { EventContext } from './context';

/**
 * Creates a parameterized cached computation. Maintains a `Map<K, V>` per
 * event context — one cached result per unique key argument.
 *
 * @param fn - Factory receiving the lookup key and `EventContext`, returning the value to cache
 * @returns A function `(key: K, ctx?: EventContext) => V` that computes on first call per key
 *
 * @example
 * ```ts
 * const parseCookie = cachedBy((name: string, ctx) => {
 *   const raw = ctx.get(cookieHeaderKey)
 *   return parseSingleCookie(raw, name)
 * })
 *
 * parseCookie('session') // computed and cached for 'session'
 * parseCookie('theme')   // computed and cached for 'theme'
 * parseCookie('session') // returns cached result
 * ```
 */
export function cachedBy<K, V>(fn: (key: K, ctx: EventContext) => V): (key: K, ctx?: EventContext) => V {
  const mapSlot = cached(() => new Map<K, V>());
  return (k, ctx?) => {
    const c = ctx ?? current();
    const map = c.get(mapSlot);
    if (!map.has(k)) {
      map.set(k, fn(k, c));
    }
    return map.get(k) as V;
  };
}
