/* eslint-disable sonarjs/no-nested-template-literals */
import { useAccept } from '../composables'
import type { BaseHttpResponse } from '../response/core'
import { BaseHttpResponseRenderer } from '../response/renderer'
import { httpStatusCodes } from '../utils/status-codes'
import svg403 from './403.tl.svg'
import svg404 from './404.tl.svg'
import svg500 from './500.tl.svg'
import errorTemplate from './error.tl.html'
import type { TWooksErrorBodyExt } from './http-error'

const icons = {
  401: svg403({}),
  403: svg403({}),
  404: svg404({}),
}

let framework: { version: string; poweredBy: string; link: string; image: string } = {
  version: __VERSION__,
  poweredBy: `wooksjs`,
  link: `https://wooks.moost.org/`,
  image: `https://wooks.moost.org/wooks-full-logo.png`,
}

export class HttpErrorRenderer extends BaseHttpResponseRenderer<TWooksErrorBodyExt> {
  constructor(
    protected opts?: { version: string; poweredBy: string; link: string; image: string }
  ) {
    super()
  }

  static registerFramework(opts: {
    version: string
    poweredBy: string
    link: string
    image: string
  }) {
    framework = opts
  }

  renderHtml(response: BaseHttpResponse<TWooksErrorBodyExt>): string {
    const data = response.body || ({} as TWooksErrorBodyExt)
    response.setContentType('text/html')
    const hasDetails = Object.keys(data).length > 3
    // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unnecessary-condition
    const icon = data.statusCode >= 500 ? svg500({}) : icons[data.statusCode as 403] || ''
    return errorTemplate({
      icon,
      statusCode: data.statusCode,
      statusMessage: httpStatusCodes[data.statusCode],
      message: data.message,
      details: hasDetails ? JSON.stringify(data, null, '  ') : '',
      version: (this.opts || framework).version,
      poweredBy: (this.opts || framework).poweredBy,
      link: (this.opts || framework).link,
      image: (this.opts || framework).image,
    })
  }

  renderText(response: BaseHttpResponse<TWooksErrorBodyExt>): string {
    const data = response.body || ({} as TWooksErrorBodyExt)
    response.setContentType('text/plain')
    const keys = Object.keys(data).filter(
      key => !['statusCode', 'error', 'message'].includes(key)
    ) as Array<keyof typeof data>
    return (
      `${data.statusCode} ${httpStatusCodes[data.statusCode]}\n${data.message}` +
      `\n\n${
        keys.length > 0
          ? `${JSON.stringify(
              {
                ...data,
                statusCode: undefined,
                message: undefined,
                error: undefined,
              },
              null,
              '  '
            )}`
          : ''
      }`
    )
  }

  renderJson(response: BaseHttpResponse<TWooksErrorBodyExt>): string {
    const data = response.body || ({} as TWooksErrorBodyExt)
    response.setContentType('application/json')
    const keys = Object.keys(data).filter(
      key => !['statusCode', 'error', 'message'].includes(key)
    ) as Array<keyof typeof data>
    return (
      `{"statusCode":${escapeQuotes(data.statusCode)},` +
      `"error":"${escapeQuotes(data.error)}",` +
      `"message":"${escapeQuotes(data.message)}"` +
      `${
        keys.length > 0
          ? `,${keys.map(k => `"${escapeQuotes(k)}":${JSON.stringify(data[k])}`).join(',')}`
          : ''
      }}`
    )
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
  return (typeof s === 'number' ? s : s || '').toString().replace(/"/gu, '\\"')
}
