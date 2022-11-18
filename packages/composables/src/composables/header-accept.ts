import { useHeaders } from './headers'
import { innerCacheSymbols } from '../core'
import { useCacheStore } from '../cache'

export function useAccept() {
    const { accept } = useHeaders()
    const { get, set, has } = useCacheStore<Record<string, boolean>>(innerCacheSymbols.accept)
    const accepts = (mime: string) => {
        if (!has(mime)) {
            return set(mime, !!(accept && (accept === '*/*' || accept.indexOf(mime) >= 0)))
        }
        return get(mime)
    }
    return {
        accept,
        accepts,
        acceptsJson: () => accepts('application/json'),
        acceptsXml:  () => accepts('application/xml'),
        acceptsText: () => accepts('text/plain'),
        acceptsHtml: () => accepts('text/html'),
    }
}
