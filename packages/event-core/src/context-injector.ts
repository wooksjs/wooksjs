/**
 * ContextInjector
 *
 * Provides a way to inject context
 * Usefull when working with opentelemetry spans
 */
export class ContextInjector<N> {
  with<T>(
    name: N,
    attributes: Record<string, string | number | boolean>,
    cb: TContextInjectorCallback<T>
  ): T
  with<T>(name: N, cb: TContextInjectorCallback<T>): T
  with<T>(
    name: N,
    attributes: Record<string, string | number | boolean> | TContextInjectorCallback<T>,
    cb?: TContextInjectorCallback<T>
  ): T {
    const fn = typeof attributes === 'function' ? attributes : cb!
    return fn()
  }

  hook(name: 'Handler:not_found' | 'Handler:routed', route?: string): void {
    //
  }
}

type TContextInjectorCallback<T> = () => T

let ci = new ContextInjector()

export function getContextInjector<N = TContextInjectorHooks>() {
  return ci as ContextInjector<N>
}

export function replaceContextInjector(newCi: ContextInjector<string>) {
  ci = newCi
}

export type TContextInjectorHooks = 'Event:start'
