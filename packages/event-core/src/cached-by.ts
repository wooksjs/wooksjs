import { cached } from './key';
import { current } from './storage';
import type { EventContext } from './context';

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
