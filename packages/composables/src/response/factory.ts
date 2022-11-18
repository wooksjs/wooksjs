import { useResponse } from '../composables'
import { WooksErrorRenderer } from '../errors/error-renderer'
import { WooksError } from '../errors/wooks-error'
import { TWooksErrorBodyExt } from '../errors/wooks-error'
import { BaseWooksResponse } from './core'
import { BaseWooksResponseRenderer, TWooksResponseRenderer } from './renderer'

export function createWooksResponder(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    renderer: TWooksResponseRenderer<any> = new BaseWooksResponseRenderer(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    errorRenderer: TWooksResponseRenderer<any> = new WooksErrorRenderer(),
) {
    function createResponse<T = unknown>(data: T): BaseWooksResponse<T | TWooksErrorBodyExt> | null {
        const { hasResponded } = useResponse()
        if (hasResponded()) return null
        if (data instanceof Error) {
            const r = new BaseWooksResponse<TWooksErrorBodyExt>(errorRenderer)
            let httpError: WooksError
            if (data instanceof WooksError) {
                httpError = data
            } else {
                httpError = new WooksError(500, data.message)
            }
            r.setBody(httpError.body)
            return r
        } else if (data instanceof BaseWooksResponse) {
            return data as BaseWooksResponse<T>
        } else {
            return new BaseWooksResponse<T>(renderer).setBody(data)
        }
    }
    return {
        createResponse,
        respond: (data: unknown) => createResponse(data)?.respond(),
    }
}
