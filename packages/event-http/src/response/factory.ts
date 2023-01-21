import { useResponse } from '../composables'
import { HttpErrorRenderer } from '../errors/error-renderer'
import { HttpError } from '../errors/http-error'
import { TWooksErrorBodyExt } from '../errors/http-error'
import { BaseHttpResponse } from './core'
import { BaseHttpResponseRenderer, TWooksResponseRenderer } from './renderer'

export function createWooksResponder(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    renderer: TWooksResponseRenderer<any> = new BaseHttpResponseRenderer(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    errorRenderer: TWooksResponseRenderer<any> = new HttpErrorRenderer(),
) {
    function createResponse<T = unknown>(data: T): BaseHttpResponse<T | TWooksErrorBodyExt> | null {
        const { hasResponded } = useResponse()
        if (hasResponded()) return null
        if (data instanceof Error) {
            const r = new BaseHttpResponse<TWooksErrorBodyExt>(errorRenderer)
            let httpError: HttpError
            if (data instanceof HttpError) {
                httpError = data
            } else {
                httpError = new HttpError(500, data.message)
            }
            r.setBody(httpError.body)
            return r
        } else if (data instanceof BaseHttpResponse) {
            return data as BaseHttpResponse<T>
        } else {
            return new BaseHttpResponse<T>(renderer).setBody(data)
        }
    }
    return {
        createResponse,
        respond: (data: unknown) => createResponse(data)?.respond(),
    }
}
