import { useRequest } from './request'
import { innerCacheSymbols } from '../core'
import { WooksURLSearchParams } from '../utils/url-search-params'
import { useCacheStore } from '../cache'

export type TSearchParamsCache = {
    raw?: string
    urlSearchParams?: WooksURLSearchParams
}

export function useSearchParams() {
    const url = useRequest().url || ''
    const { get, set, has } = useCacheStore<TSearchParamsCache>(innerCacheSymbols.searchParams)

    function rawSearchParams() {
        if (!has('raw')) {
            const i = url.indexOf('?')
            return set('raw', i >=0 ? url.slice(i) : '')
        }
        return get('raw') || ''
    }

    function urlSearchParams(): WooksURLSearchParams {
        if (!has('urlSearchParams')) {
            return set('urlSearchParams', new WooksURLSearchParams(rawSearchParams()))
        }
        return get('urlSearchParams') as WooksURLSearchParams
    }

    return {
        rawSearchParams, 
        urlSearchParams,
        jsonSearchParams: () => urlSearchParams().toJson(),
    }
}
