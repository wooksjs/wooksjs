import type { EventContext } from '@wooksjs/event-core'

import { useAccept } from '../composables/header-accept'
import svg403 from '../errors/403.tl.svg'
import svg404 from '../errors/404.tl.svg'
import svg500 from '../errors/500.tl.svg'
import errorTemplate from '../errors/error.tl.html'
import type { TWooksErrorBodyExt } from '../errors/http-error'
import { escapeHtml } from '../utils/escape-html'
import { httpStatusCodes } from '../utils/status-codes'
import type { EHttpStatusCode } from '../utils/status-codes'
import { HttpResponse } from './http-response'

let framework = {
  version: __VERSION__,
  poweredBy: 'wooksjs',
  link: 'https://wooks.moost.org/',
  image: 'https://wooks.moost.org/wooks-full-logo.svg',
}

const icons = {
  401: typeof svg403 === 'function' ? svg403({}) : '',
  403: typeof svg403 === 'function' ? svg403({}) : '',
  404: typeof svg404 === 'function' ? svg404({}) : '',
  500: typeof svg500 === 'function' ? svg500({}) : '',
}

/**
 * Default `HttpResponse` subclass used by `createHttpApp`.
 *
 * Overrides error rendering to produce content-negotiated responses (JSON, HTML, or plain text)
 * based on the request's `Accept` header. HTML error pages include SVG icons and framework branding.
 */
export class WooksHttpResponse extends HttpResponse {
  /** Registers framework metadata (name, version, link, logo) used in HTML error pages. */
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
    const { has } = useAccept(ctx)
    if (has('json')) {
      this._headers['content-type'] = 'application/json'
      this._body = JSON.stringify(data)
    } else if (has('html')) {
      this._headers['content-type'] = 'text/html'
      this._body = renderErrorHtml(data)
    } else if (has('text')) {
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
  const icon = data.statusCode >= 500 ? icons[500] : icons[data.statusCode as 403] || ''
  return typeof errorTemplate === 'function'
    ? errorTemplate({
        icon,
        statusCode: data.statusCode,
        statusMessage: httpStatusCodes[data.statusCode],
        message: escapeHtml(data.message),
        details: hasDetails ? escapeHtml(JSON.stringify(data, null, '  ')) : '',
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
