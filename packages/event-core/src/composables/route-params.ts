import { useAsyncEventContext } from '../context'

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
