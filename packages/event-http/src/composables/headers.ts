import type { IncomingHttpHeaders } from 'http'

import { useHttpContext } from '../event-http'
import { useRequest } from './request'

export function useHeaders(): IncomingHttpHeaders {
  return useRequest().headers
}

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

export function useSetHeader(name: string) {
  const { store } = useHttpContext()
  const { hook } = store('setHeader')
  return hook(name)
}

export type THeaderHook = ReturnType<typeof useSetHeader>
