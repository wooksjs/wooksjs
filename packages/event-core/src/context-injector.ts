/**
 * ContextInjector
 *
 * Provides a way to inject context
 * Usefull when working with opentelemetry spans
 */
export class ContextInjector {
  with<T>(
    name: string,
    attributes: Record<string, string | number | boolean>,
    cb: TContextInjectorCallback<T>
  ): T
  with<T>(name: string, cb: TContextInjectorCallback<T>): T
  with<T>(
    name: string,
    attributes: Record<string, string | number | boolean> | TContextInjectorCallback<T>,
    cb?: TContextInjectorCallback<T>
  ): T {
    const fn = typeof attributes === 'function' ? attributes : cb!
    return fn()
  }
}

type TContextInjectorCallback<T> = () => T

let ci = new ContextInjector()

export function getContextInjector() {
  return ci
}

export function replaceContextInjector(newCi: ContextInjector) {
  ci = newCi
}
