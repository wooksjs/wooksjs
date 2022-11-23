import { useEventContext } from '../context'

export function useRouteParams<T extends object = Record<string, string | string[]>>() {
    const { store } = useEventContext()
    const routeParams = (store('routeParams').value || {}) as T

    function getRouteParam<K extends keyof T>(name: K) {
        return routeParams[name] as T[K]
    }

    return {
        routeParams,
        getRouteParam,
    }
}
