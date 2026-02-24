import type { EventContext } from './context';

export interface Logger {
  info(msg: string, ...args: unknown[]): void
  warn(msg: string, ...args: unknown[]): void
  error(msg: string, ...args: unknown[]): void
  debug(msg: string, ...args: unknown[]): void
  topic?: (name?: string) => Logger
}

export interface Key<T> {
  readonly _id: number;
  readonly _name: string;
  /** @internal */ readonly _T?: T;
}

export interface Cached<T> {
  readonly _id: number;
  readonly _name: string;
  readonly _fn: (ctx: EventContext) => T;
  /** @internal */ readonly _T?: T;
}

export type Accessor<T> = Key<T> | Cached<T>;

export interface SlotMarker<T> {
  /** @internal */ readonly _T?: T;
}

export type EventKind<S extends Record<string, SlotMarker<any>>> = {
  readonly name: string;
  readonly keys: { [K in keyof S]: S[K] extends SlotMarker<infer V> ? Key<V> : never };
  /** @internal Pre-computed entries for fast attach(). */
  readonly _entries: [string, Key<unknown>][];
};

export type EventKindSeeds<K> =
  K extends EventKind<infer S>
    ? { [P in keyof S]: S[P] extends SlotMarker<infer V> ? V : never }
    : never;
