import { useRequest } from './request'
import { useHttpContext } from '../event-http'
import { WooksURLSearchParams } from '../utils/url-search-params'

export function useSearchParams() {
    const { store } = useHttpContext()
    const url = useRequest().url || ''
    const { init } = store('searchParams')

    const rawSearchParams = () => init('raw', () => {
        const i = url.indexOf('?')
        return i >=0 ? url.slice(i) : ''
    })

    const urlSearchParams = () => init('urlSearchParams', () => new WooksURLSearchParams(rawSearchParams()))

    return {
        rawSearchParams, 
        urlSearchParams,
        jsonSearchParams: () => urlSearchParams().toJson(),
    }
}
