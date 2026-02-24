import type { EventKind, SlotMarker } from './types';
import { key } from './key';

export function slot<T>(): SlotMarker<T> {
  return {} as SlotMarker<T>;
}

export function defineEventKind<S extends Record<string, SlotMarker<any>>>(
  name: string,
  schema: S,
): EventKind<S> {
  const keys = {} as EventKind<S>['keys'];
  const _entries: [string, Key<unknown>][] = [];
  for (const prop of Object.keys(schema)) {
    const k = key(`${name}.${prop}`);
    (keys as Record<string, unknown>)[prop] = k;
    _entries.push([prop, k]);
  }
  return { name, keys, _entries };
}
