import { useAsyncEventContext } from '../context'

/**
 * Composable that provides access to route parameters from the current event context.
 *
 * @example
 * ```ts
 * const { get, params } = useRouteParams<{ id: string }>()
 * console.log(get('id')) // '123'
 * console.log(params)    // { id: '123' }
 * ```
 */
export function useRouteParams<T extends object = Record<string, string | string[]>>(): {
  params: T
  get: <K extends keyof T>(name: K) => T[K]
} {
  const { store } = useAsyncEventContext()
  const params = (store('routeParams').value || {}) as T

  function get<K extends keyof T>(name: K) {
    return params[name]
  }

  return {
    params,
    get,
  }
}
