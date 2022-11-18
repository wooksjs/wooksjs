import { EHttpStatusCode } from '../utils/status-codes'
import { innerCacheSymbols, useWooksCtx } from '../core'
import { useCacheStore } from '../cache'
import { attachHook } from '../hooks'

type TUseResponseOptions = {
    passthrough: boolean // when true: keep building response via framework
}

export function useResponse() {
    const respHandle = useCacheStore<{ responded: boolean }>(innerCacheSymbols.response)
    const { res } = useWooksCtx().getCtx()

    const statusHandle = useCacheStore<{ code: EHttpStatusCode }>(innerCacheSymbols.status)
    function status(code?: EHttpStatusCode) {
        if (code) {
            return statusHandle.set('code', code)
        }
        return statusHandle.get('code')
    }

    const rawResponse = (options?: TUseResponseOptions) => {
        if (!options || !options.passthrough) respHandle.set('responded', true)
        return res
    }

    return {
        rawResponse,
        hasResponded: () => respHandle.get('responded') || !res.writable || res.writableEnded,
        status: attachHook(status, {
            get: () => status() as EHttpStatusCode,
            set: (code: EHttpStatusCode) => status(code),
        }),
    }
}

export function useStatus() {
    return useResponse().status
}

export type TStatusHook = ReturnType<typeof useStatus>
