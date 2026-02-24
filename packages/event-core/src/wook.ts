import { cached } from './key';
import { current } from './storage';
import type { EventContext } from './context';

export function defineWook<T>(factory: (ctx: EventContext) => T): (ctx?: EventContext) => T {
  const slot = cached(factory);
  return (ctx?) => (ctx ?? current()).get(slot);
}
