import { useRequest } from './request'
import { useHttpContext } from '../http-event'
import { WooksURLSearchParams } from '../utils/url-search-params'

export function useSearchParams() {
    const { store } = useHttpContext()
    const url = useRequest().url || ''
    const { hook } = store('searchParams')

    function rawSearchParams() {
        const raw = hook('raw')
        if (!raw.isDefined) {
            const i = url.indexOf('?')
            return raw.value = i >=0 ? url.slice(i) : ''
        }
        return raw.value || ''
    }

    function urlSearchParams(): WooksURLSearchParams {
        const urlSearchParams = hook('urlSearchParams')
        if (!urlSearchParams.isDefined) {
            return urlSearchParams.value = new WooksURLSearchParams(rawSearchParams())
        }
        return urlSearchParams.value as WooksURLSearchParams
    }

    return {
        rawSearchParams, 
        urlSearchParams,
        jsonSearchParams: () => urlSearchParams().toJson(),
    }
}
