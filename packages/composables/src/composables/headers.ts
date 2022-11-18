import { IncomingHttpHeaders } from 'http'
import { useCacheStore } from '../cache'
import { innerCacheSymbols } from '../core'
import { attachHook } from '../hooks'
import { useRequest } from './request'

export function useHeaders(): IncomingHttpHeaders {
    return useRequest().headers
}

export function useSetHeaders() {
    const { get, set, del, getAll } = useCacheStore<Record<string, string | string[]>>(innerCacheSymbols.setHeader)
    
    function setHeader(name: string, value: string | number) {
        set(name, value.toString())
    }

    function setContentType(value: string) {
        setHeader('content-type', value)
    }

    function enableCors(origin: string = '*') {
        setHeader('access-control-allow-origin', origin)
    }

    return {
        setHeader,
        getHeader: get,
        removeHeader: del,
        setContentType,
        headers: () => getAll() as Record<string, string | string[]>,
        enableCors,
    }
}

export function useSetHeader(name: string) {
    const { setHeader, headers } = useSetHeaders()

    return attachHook({
        name,
        type: 'header',
    }, {
        get: () => headers()[name] as string,
        set: (value: string | number) => setHeader(name, value),
    })
}

export type THeaderHook = ReturnType<typeof useSetHeader>
