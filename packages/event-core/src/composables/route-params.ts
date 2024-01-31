import { useEventContext } from '../context'

export function useRouteParams<T extends object = Record<string, string | string[]>>() {
  const { store } = useEventContext()
  const params = (store('routeParams').value || {}) as T

  function get<K extends keyof T>(name: K) {
    return params[name]
  }

  return {
    params,
    get,
  }
}
