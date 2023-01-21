import { TWooksErrorBodyExt } from './http-error'
import { useAccept } from '../composables'
import { BaseHttpResponse } from '../response/core'
import { httpStatusCodes } from '../utils/status-codes'
import { BaseHttpResponseRenderer } from '../response/renderer'

const preStyles = 'font-family: monospace;'
+ 'width: 100%;'
+ 'max-width: 900px;'
+ 'padding: 10px;'
+ 'margin: 20px auto;'
+ 'border-radius: 8px;'
+ 'background-color: #494949;'
+ 'box-shadow: 0px 0px 3px 2px rgb(255 255 255 / 20%);'

export class HttpErrorRenderer extends BaseHttpResponseRenderer<TWooksErrorBodyExt> {
    renderHtml(response: BaseHttpResponse<TWooksErrorBodyExt>): string {
        const data = response.body || {} as TWooksErrorBodyExt
        response.setContentType('text/html')
        const keys = Object.keys(data).filter(key => !['statusCode', 'error', 'message'].includes(key)) as (keyof typeof data)[]
        return '<html style="background-color: #333; color: #bbb;">' +
            `<head><title>${ data.statusCode } ${ httpStatusCodes[data.statusCode] }</title></head>` +
            `<body><center><h1>${ data.statusCode } ${ httpStatusCodes[data.statusCode] }</h1></center>` + 
            `<center><h4>${ data.message }</h1></center><hr color="#666">` +
            `<center style="color: #666;"> Wooks v${ __VERSION__ } </center>` +
            `${keys.length ? `<pre style="${ preStyles }">${JSON.stringify({...data, statusCode: undefined, message: undefined, error: undefined}, null, '  ')}</pre>` : ''}` + 
            '</body></html>'
    }

    renderText(response: BaseHttpResponse<TWooksErrorBodyExt>): string {
        const data = response.body || {} as TWooksErrorBodyExt
        response.setContentType('text/plain')
        const keys = Object.keys(data).filter(key => !['statusCode', 'error', 'message'].includes(key)) as (keyof typeof data)[]
        return `${ data.statusCode } ${ httpStatusCodes[data.statusCode] }\n${ data.message }`
            + `\n\n${keys.length ? `${JSON.stringify({...data, statusCode: undefined, message: undefined, error: undefined}, null, '  ')}` : ''}`
    }

    renderJson(response: BaseHttpResponse<TWooksErrorBodyExt>): string {
        const data = response.body || {} as TWooksErrorBodyExt
        response.setContentType('application/json')
        const keys = Object.keys(data).filter(key => !['statusCode', 'error', 'message'].includes(key)) as (keyof typeof data)[]
        return `{"statusCode":${ escapeQuotes(data.statusCode) },`
            + `"error":"${ escapeQuotes(data.error) }",`
            + `"message":"${ escapeQuotes(data.message) }"`
            + `${ keys.length ? (',' + keys.map(k => `"${escapeQuotes(k)}":${JSON.stringify(data[k])}`).join(',')) : '' }}`
    }

    render(response: BaseHttpResponse<TWooksErrorBodyExt>): string {
        const { acceptsJson, acceptsText, acceptsHtml } = useAccept()
        response.status = response.body?.statusCode || 500
        if (acceptsJson()) {
            return this.renderJson(response)
        } else if (acceptsHtml()) {
            return this.renderHtml(response)
        } else if (acceptsText()) {
            return this.renderText(response)
        } else {
            return this.renderJson(response)
        }
    }
}

function escapeQuotes(s: string | number): string {
    return (typeof s === 'number' ? s : (s || '')).toString().replace(/[\""]/g, '\\"')
}
