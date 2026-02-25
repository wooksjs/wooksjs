import { URL } from 'node:url'

import { useLogger, useRequest, useResponse } from '@wooksjs/event-http'

import { applyProxyControls, CookiesIterable, HeadersIterable } from './proxy-utils'
import type { TWooksProxyOptions } from './types'

const reqHeadersToBlock = [
  'connection',
  'accept-encoding',
  'content-length',
  'upgrade-insecure-requests',
  'cookie',
]

const SET_COOKIE = 'set-cookie'

const resHeadersToBlock = ['transfer-encoding', 'content-encoding', SET_COOKIE]

/**
 * Composable that returns a `proxy` function for forwarding HTTP requests to a target URL.
 *
 * @example
 * ```ts
 * app.get('/api/*', async () => {
 *   const proxy = useProxy()
 *   const response = await proxy('https://backend.example.com/api', {
 *     reqHeaders: { allow: '*' },
 *     resHeaders: { allow: '*' },
 *   })
 *   return response
 * })
 * ```
 *
 * @returns An async `proxy(target, opts?)` function that forwards the current request to the given target URL.
 */
export function useProxy() {
  const response = useResponse()
  const { raw } = useRequest()
  const req = raw
  const logger = useLogger()

  return async function proxy(target: string, opts?: TWooksProxyOptions): Promise<Response> {
    const targetUrl = new URL(target)
    const path = targetUrl.pathname || '/'
    const url = new URL(path, targetUrl.origin).toString() + targetUrl.search

    // preparing request headers and cookies
    const modifiedHeaders = { ...req.headers, host: targetUrl.hostname }
    const headers = opts?.reqHeaders
      ? applyProxyControls(new HeadersIterable(modifiedHeaders), opts.reqHeaders, reqHeadersToBlock)
      : {}
    const cookies =
      opts?.reqCookies && req.headers.cookie
        ? applyProxyControls(new CookiesIterable(req.headers.cookie), opts.reqCookies)
        : null

    if (cookies) {
      headers.cookie = Object.entries(cookies)
        .map((v) => v.join('='))
        .join('; ')
    }

    const method = opts?.method || req.method

    // actual request
    if (opts?.debug) {
      logger.info(
        `${__DYE_GREEN__}${req.method!} ${req.url!}${__DYE_YELLOW__} → ${__DYE_CYAN__}${method!} ${url}${__DYE_YELLOW__}`,
      )
      logger.info(
        `${__DYE_YELLOW__}headers:`,
        JSON.stringify(headers, null, '  '),
        __DYE_COLOR_OFF__,
      )
    }
    const resp = await fetch(url, {
      method,
      body: ['GET', 'HEAD'].includes(method!) ? undefined : (req as unknown as BodyInit),
      headers: headers as unknown as HeadersInit,
    })

    // preparing response
    response.status = resp.status

    if (opts?.debug) {
      logger.info(
        `${
          resp.status
        } ${__DYE_GREEN__}${req.method!} ${req.url!}${__DYE_YELLOW__} → ${__DYE_CYAN__}${method!} ${url}${__DYE_YELLOW__}`,
      )
      logger.info(`${__DYE_YELLOW__}response headers:${__DYE_COLOR_OFF__}`)
    }

    // preparing response headers
    const resHeaders = opts?.resHeaders
      ? applyProxyControls(resp.headers.entries(), opts.resHeaders, resHeadersToBlock)
      : null
    const resCookies = opts?.resCookies
      ? applyProxyControls(new CookiesIterable(resp.headers.get(SET_COOKIE) || ''), opts.resCookies)
      : null

    if (resHeaders) {
      for (const [name, value] of Object.entries(resHeaders)) {
        if (name) {
          response.setHeader(name, value)
          if (opts?.debug) {
            logger.info(`\t${__DYE_YELLOW__}${name}=${__DYE_GREEN__}${value}${__DYE_COLOR_OFF__}`)
          }
        }
      }
    }

    if (resCookies) {
      for (const [name, value] of Object.entries(resCookies)) {
        if (name) {
          response.setCookieRaw(`${name}=${value}`)
          if (opts?.debug) {
            logger.info(
              `\t${__DYE_BOLD__}${__DYE_YELLOW__}${SET_COOKIE}=${__DYE_GREEN__}${name}=${value}${__DYE_RESET__}`,
            )
          }
        }
      }
    }

    return resp
  }
}
