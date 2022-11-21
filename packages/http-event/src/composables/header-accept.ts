import { useHttpContext } from '../http-event'
import { useHeaders } from './headers'

export function useAccept() {
    const { store } = useHttpContext()
    const { accept } = useHeaders()
    const accepts = (mime: string) => {
        const { set, get, has } = store('accept')
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
