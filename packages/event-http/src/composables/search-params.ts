import { useHttpContext } from '../event-http'
import { WooksURLSearchParams } from '../utils/url-search-params'
import { useRequest } from './request'

/**
 * Provides access to URL search (query) parameters from the request.
 * @example
 * ```ts
 * const { urlSearchParams, jsonSearchParams } = useSearchParams()
 * const page = urlSearchParams().get('page')
 * ```
 */
export function useSearchParams() {
  const { store } = useHttpContext()
  const url = useRequest().url || ''
  const { init } = store('searchParams')

  const rawSearchParams = () =>
    init('raw', () => {
      const i = url.indexOf('?')
      return i >= 0 ? url.slice(i) : ''
    })

  const urlSearchParams = () =>
    init('urlSearchParams', () => new WooksURLSearchParams(rawSearchParams()))

  return {
    rawSearchParams,
    urlSearchParams,
    jsonSearchParams: () => urlSearchParams().toJson(),
  }
}
