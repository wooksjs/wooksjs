import { BaseWooksResponse } from './core'
import { panic } from 'common/panic'

export class BaseWooksResponseRenderer<T = unknown> implements TWooksResponseRenderer<T> {
    render(response: BaseWooksResponse<T>): string | Uint8Array {
        if (typeof response.body === 'string' || typeof response.body === 'boolean' || typeof response.body === 'number') {
            if (!response.getContentType()) response.setContentType('text/plain')
            return response.body.toString()
        }
        if (typeof response.body === 'undefined') {
            return ''
        }
        if (response.body instanceof Uint8Array) {
            return response.body
        }
        if (typeof response.body === 'object') {
            if (!response.getContentType()) response.setContentType('application/json')
            return JSON.stringify(response.body)
        }
        throw panic('Unsupported body format "' + typeof response.body + '"')
    }    
}

export interface TWooksResponseRenderer<T = unknown> {
    render: (response: BaseWooksResponse<T>) => string | Uint8Array
}
