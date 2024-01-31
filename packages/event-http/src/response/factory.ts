import { useResponse } from '../composables'
import { HttpErrorRenderer } from '../errors/error-renderer'
import type { TWooksErrorBodyExt } from '../errors/http-error'
import { HttpError } from '../errors/http-error'
import { BaseHttpResponse } from './core'
import type { TWooksResponseRenderer } from './renderer'
import { BaseHttpResponseRenderer } from './renderer'

export function createWooksResponder(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  renderer: TWooksResponseRenderer<any> = new BaseHttpResponseRenderer(),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  errorRenderer: TWooksResponseRenderer<any> = new HttpErrorRenderer()
) {
  function createResponse<T = unknown>(data: T): BaseHttpResponse<T | TWooksErrorBodyExt> | null {
    const { hasResponded } = useResponse()
    if (hasResponded()) {
      return null
    }
    if (data instanceof Error) {
      const r = new BaseHttpResponse<TWooksErrorBodyExt>(errorRenderer)
      const httpError: HttpError =
        data instanceof HttpError ? data : new HttpError(500, data.message)
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
    respond: async (data: unknown) => createResponse(data)?.respond(),
  }
}
