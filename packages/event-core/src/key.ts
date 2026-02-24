import type { EventContext } from './context';
import type { Key, Cached } from './types';

let nextId = 0;

export function key<T>(name: string): Key<T> {
  return { _id: nextId++, _name: name } as Key<T>;
}

export function cached<T>(fn: (ctx: EventContext) => T): Cached<T> {
  return { _id: nextId++, _name: `cached:${nextId}`, _fn: fn } as Cached<T>;
}

export function isCached<T>(accessor: Key<T> | Cached<T>): accessor is Cached<T> {
  return '_fn' in accessor;
}
