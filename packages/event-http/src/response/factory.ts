import { useResponse } from '../composables'
import { WooksErrorRenderer } from '../errors/error-renderer'
import { HttpError } from '../errors/http-error'
import { TWooksErrorBodyExt } from '../errors/http-error'
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
            let httpError: HttpError
            if (data instanceof HttpError) {
                httpError = data
            } else {
                httpError = new HttpError(500, data.message)
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
