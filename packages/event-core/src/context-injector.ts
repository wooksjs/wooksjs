/**
 * No-op base class for observability integration. Subclass and override
 * `with()` / `hook()` to add tracing, metrics, or logging around event
 * lifecycle points.
 *
 * The default implementation simply calls the callback with no overhead.
 * Replace via `replaceContextInjector()` to enable instrumentation.
 */
export class ContextInjector<N> {
  /**
   * Wraps a callback with optional named attributes for observability.
   * Default implementation just calls `cb()` — override for tracing.
   */
  with<T>(name: N, attributes: Record<string, string | number | boolean>, cb: () => T): T
  with<T>(name: N, cb: () => T): T
  with<T>(
    name: N,
    attributes: Record<string, string | number | boolean> | (() => T),
    cb?: () => T,
  ): T {
    const fn = typeof attributes === 'function' ? attributes : cb!
    return fn()
  }

  /**
   * Hook called by adapters at specific lifecycle points (e.g., after route lookup).
   * Default implementation is a no-op — override for observability.
   */
  hook(_method: string, _name: 'Handler:not_found' | 'Handler:routed', _route?: string): void {
    //
  }
}

let ci: ContextInjector<string> | null = null

/**
 * Returns the current `ContextInjector` instance, or `null` if none has been installed.
 * Used internally by adapters to wrap lifecycle events.
 */
export function getContextInjector<N = TContextInjectorHooks>(): ContextInjector<N> | null {
  return ci as ContextInjector<N> | null
}

/**
 * Replaces the global `ContextInjector` with a custom implementation.
 * Use this to integrate OpenTelemetry or other observability tools.
 *
 * @param newCi - Custom `ContextInjector` subclass instance
 *
 * @example
 * ```ts
 * class OtelInjector extends ContextInjector<string> {
 *   with<T>(name: string, attrs: Record<string, any>, cb: () => T): T {
 *     return tracer.startActiveSpan(name, (span) => {
 *       span.setAttributes(attrs)
 *       try { return cb() } finally { span.end() }
 *     })
 *   }
 * }
 * replaceContextInjector(new OtelInjector())
 * ```
 */
export function replaceContextInjector(newCi: ContextInjector<string>): void {
  ci = newCi
}

/**
 * Resets the global `ContextInjector` back to `null` (no-op default).
 * Useful for tests or when disabling instrumentation.
 */
export function resetContextInjector(): void {
  ci = null
}

/** Built-in hook names used by the framework. */
export type TContextInjectorHooks = 'Event:start'
