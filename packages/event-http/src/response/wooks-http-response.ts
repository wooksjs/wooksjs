import type { EventContext } from '@wooksjs/event-core'

import { useAccept } from '../composables/header-accept'
import svg403 from '../errors/403.tl.svg'
import svg404 from '../errors/404.tl.svg'
import svg500 from '../errors/500.tl.svg'
import errorTemplate from '../errors/error.tl.html'
import type { TWooksErrorBodyExt } from '../errors/http-error'
import { httpStatusCodes } from '../utils/status-codes'
import type { EHttpStatusCode } from '../utils/status-codes'
import { HttpResponse } from './http-response'

let framework = {
  version: __VERSION__,
  poweredBy: 'wooksjs',
  link: 'https://wooks.moost.org/',
  image: 'https://wooks.moost.org/wooks-full-logo.png',
}

const icons = {
  401: typeof svg403 === 'function' ? svg403({}) : '',
  403: typeof svg403 === 'function' ? svg403({}) : '',
  404: typeof svg404 === 'function' ? svg404({}) : '',
  500: typeof svg500 === 'function' ? svg500({}) : '',
}

export class WooksHttpResponse extends HttpResponse {
  static registerFramework(opts: {
    version: string
    poweredBy: string
    link: string
    image: string
  }) {
    framework = opts
  }

  protected renderError(data: TWooksErrorBodyExt, ctx: EventContext): void {
    this._status = (data.statusCode || 500) as EHttpStatusCode
    const { acceptsJson, acceptsHtml, acceptsText } = useAccept(ctx)
    if (acceptsJson()) {
      this._headers['content-type'] = 'application/json'
      this._body = JSON.stringify(data)
    } else if (acceptsHtml()) {
      this._headers['content-type'] = 'text/html'
      this._body = renderErrorHtml(data)
    } else if (acceptsText()) {
      this._headers['content-type'] = 'text/plain'
      this._body = renderErrorText(data)
    } else {
      this._headers['content-type'] = 'application/json'
      this._body = JSON.stringify(data)
    }
  }
}

function renderErrorHtml(data: TWooksErrorBodyExt): string {
  const hasDetails = Object.keys(data).length > 3
  const icon =
    data.statusCode >= 500
      ? icons[500]
      : (icons[data.statusCode as 403] || '')
  return typeof errorTemplate === 'function'
    ? errorTemplate({
        icon,
        statusCode: data.statusCode,
        statusMessage: httpStatusCodes[data.statusCode],
        message: data.message,
        details: hasDetails ? JSON.stringify(data, null, '  ') : '',
        version: framework.version,
        poweredBy: framework.poweredBy,
        link: framework.link,
        image: framework.image,
      })
    : JSON.stringify(data, null, '  ')
}

function renderErrorText(data: TWooksErrorBodyExt): string {
  const keys = Object.keys(data).filter(
    (key) => !['statusCode', 'error', 'message'].includes(key),
  ) as Array<keyof typeof data>
  return (
    `${data.statusCode} ${httpStatusCodes[data.statusCode]}\n${data.message}` +
    `\n\n${
      keys.length > 0
        ? JSON.stringify(
            {
              ...data,
              statusCode: undefined,
              message: undefined,
              error: undefined,
            },
            null,
            '  ',
          )
        : ''
    }`
  )
}
