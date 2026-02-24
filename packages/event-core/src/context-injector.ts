export class ContextInjector<N> {
  with<T>(
    name: N,
    attributes: Record<string, string | number | boolean>,
    cb: () => T,
  ): T
  with<T>(name: N, cb: () => T): T
  with<T>(
    name: N,
    attributes: Record<string, string | number | boolean> | (() => T),
    cb?: () => T,
  ): T {
    const fn = typeof attributes === 'function' ? attributes : cb!
    return fn()
  }

  hook(_method: string, _name: 'Handler:not_found' | 'Handler:routed', _route?: string): void {
    //
  }
}

let ci = new ContextInjector()

export function getContextInjector<N = TContextInjectorHooks>(): ContextInjector<N> {
  return ci as ContextInjector<N>
}

export function replaceContextInjector(newCi: ContextInjector<string>): void {
  ci = newCi
}

export type TContextInjectorHooks = 'Event:start'
