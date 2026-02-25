import type { EventContext } from './context';

/**
 * Logger interface used throughout Wooks. Passed via `EventContextOptions`
 * and accessed with `useLogger()`. Compatible with `@prostojs/logger` and
 * most standard loggers.
 */
export interface Logger {
  info(msg: string, ...args: unknown[]): void
  warn(msg: string, ...args: unknown[]): void
  error(msg: string, ...args: unknown[]): void
  debug(msg: string, ...args: unknown[]): void
  /** Creates a child logger with a topic prefix (optional). */
  topic?: (name?: string) => Logger
}

/**
 * A typed, writable context slot. Created with `key<T>(name)`.
 * Use `ctx.set(k, value)` to store and `ctx.get(k)` to retrieve.
 */
export interface Key<T> {
  readonly _id: number;
  readonly _name: string;
  /** @internal Type brand — not used at runtime. */
  readonly _T?: T;
}

/**
 * A lazily-computed, read-only context slot. Created with `cached<T>(fn)`.
 * The factory runs once per context on first `ctx.get()` call; the result is cached.
 */
export interface Cached<T> {
  readonly _id: number;
  readonly _name: string;
  readonly _fn: (ctx: EventContext) => T;
  /** @internal Type brand — not used at runtime. */
  readonly _T?: T;
}

/** Union type for any context slot — either a writable `Key` or a computed `Cached`. */
export type Accessor<T> = Key<T> | Cached<T>;

/**
 * Type-level marker used in `defineEventKind` schemas. Each `slot<T>()`
 * becomes a typed `Key<T>` on the resulting `EventKind`. No runtime behavior.
 */
export interface SlotMarker<T> {
  /** @internal Type brand — not used at runtime. */
  readonly _T?: T;
}

/**
 * Declares the shape of an event type — its name and typed seed slots.
 * Created with `defineEventKind(name, schema)`.
 *
 * Use `kind.keys.<prop>` to access typed context keys for each slot.
 */
export type EventKind<S extends Record<string, SlotMarker<any>>> = {
  /** Unique event kind name (e.g. `'http'`, `'cli'`). */
  readonly name: string;
  /** Typed context keys for each slot in the schema. */
  readonly keys: { [K in keyof S]: S[K] extends SlotMarker<infer V> ? Key<V> : never };
  /** @internal Pre-computed entries for fast `attach()`. */
  readonly _entries: [string, Key<unknown>][];
};

/**
 * Extracts the seed values type for an `EventKind`. This is the object
 * shape passed to `ctx.attach(kind, seeds)` or `createEventContext(opts, kind, seeds, fn)`.
 */
export type EventKindSeeds<K> =
  K extends EventKind<infer S>
    ? { [P in keyof S]: S[P] extends SlotMarker<infer V> ? V : never }
    : never;
