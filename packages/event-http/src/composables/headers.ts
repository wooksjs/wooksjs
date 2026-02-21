import type { IncomingHttpHeaders } from 'http'

import { useHttpContext } from '../event-http'
import { useRequest } from './request'

/**
 * Returns the incoming request headers.
 * @example
 * ```ts
 * const { host, authorization } = useHeaders()
 * ```
 */
export function useHeaders(): IncomingHttpHeaders {
  return useRequest().headers
}

/**
 * Provides methods to set, get, and remove outgoing response headers.
 * @example
 * ```ts
 * const { setHeader, setContentType, enableCors } = useSetHeaders()
 * setHeader('x-request-id', '123')
 * ```
 */
export function useSetHeaders() {
  const { store } = useHttpContext()
  const setHeaderStore = store('setHeader')

  function setHeader(name: string, value: string | number) {
    setHeaderStore.set(name, value.toString())
  }

  function setContentType(value: string) {
    setHeader('content-type', value)
  }

  function enableCors(origin = '*') {
    setHeader('access-control-allow-origin', origin)
  }

  return {
    setHeader,
    getHeader: setHeaderStore.get,
    removeHeader: setHeaderStore.del,
    setContentType,
    headers: () => setHeaderStore.value || {},
    enableCors,
  }
}

/** Returns a hookable accessor for a single outgoing response header by name. */
export function useSetHeader(name: string) {
  const { store } = useHttpContext()
  const { hook } = store('setHeader')
  return hook(name)
}

/** Hook type returned by {@link useSetHeader}. */
export type THeaderHook = ReturnType<typeof useSetHeader>
