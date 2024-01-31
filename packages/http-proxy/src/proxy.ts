import { useEventLogger } from '@wooksjs/event-core'
import { useHttpContext, useSetHeaders, useStatus } from '@wooksjs/event-http'
import { fetch } from 'node-fetch-native'

import { applyProxyControls, CookiesIterable, HeadersIterable } from './proxy-utils'
import type { TWooksProxyOptions } from './types'

const reqHeadersToBlock = [
  'connection',
  'accept-encoding',
  'content-length',
  'upgrade-insecure-requests',
  'cookie',
]

const resHeadersToBlock = ['transfer-encoding', 'content-encoding', 'set-cookie']

export function useProxy() {
  const status = useStatus()
  const { setHeader, headers: getSetHeaders } = useSetHeaders()
  const { getCtx } = useHttpContext()
  const { req } = getCtx().event
  const logger = useEventLogger('http-proxy')

  const setHeadersObject = getSetHeaders()

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
        .map(v => v.join('='))
        .join('; ')
    }

    const method = opts?.method || req.method

    // actual request
    if (opts?.debug) {
      logger.info(
        `${__DYE_GREEN__}${req.method!} ${req.url!}${__DYE_YELLOW__} → ${__DYE_CYAN__}${method!} ${url}${__DYE_YELLOW__}`
      )
      logger.info(
        `${__DYE_YELLOW__}headers:`,
        JSON.stringify(headers, null, '  '),
        __DYE_COLOR_OFF__
      )
    }
    const resp = await fetch(url, {
      method,
      body: ['GET', 'HEAD'].includes(method!) ? undefined : (req as unknown as BodyInit),
      headers: headers as unknown as HeadersInit,
    })

    // preparing response
    status.value = resp.status

    if (opts?.debug) {
      logger.info(
        `${resp.status} ${__DYE_GREEN__}${req.method!} ${req.url!}${__DYE_YELLOW__} → ${__DYE_CYAN__}${method!} ${url}${__DYE_YELLOW__}`
      )
      logger.info(`${__DYE_YELLOW__}response headers:${__DYE_COLOR_OFF__}`)
    }

    // preparing response headers
    const resHeaders = opts?.resHeaders
      ? applyProxyControls(resp.headers.entries(), opts.resHeaders, resHeadersToBlock)
      : null
    const resCookies = opts?.resCookies
      ? applyProxyControls(
          new CookiesIterable(resp.headers.get('set-cookie') || ''),
          opts.resCookies
        )
      : null

    if (resHeaders) {
      for (const [name, value] of Object.entries(resHeaders)) {
        if (name) {
          setHeader(name, value)
          if (opts?.debug) {
            logger.info(`\t${__DYE_YELLOW__}${name}=${__DYE_GREEN__}${value}${__DYE_COLOR_OFF__}`)
          }
        }
      }
    }

    if (resCookies) {
      setHeadersObject['set-cookie'] = (setHeadersObject['set-cookie'] || []) as string[]
      for (const [name, value] of Object.entries(resCookies)) {
        if (name) {
          setHeadersObject['set-cookie'].push(`${name}=${value}`)
          if (opts?.debug) {
            logger.info(
              `\t${__DYE_BOLD__}${__DYE_YELLOW__}set-cookie=${__DYE_GREEN__}${name}=${value}${__DYE_RESET__}`
            )
          }
        }
      }
    }

    return resp
  }
}
