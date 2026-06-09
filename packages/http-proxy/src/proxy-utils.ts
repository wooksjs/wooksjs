import { HttpError } from '@wooksjs/event-http'
import type { IncomingHttpHeaders } from 'http'

import type { TWooksProxyControls } from './types'

const ALLOWED_PROXY_PROTOCOLS = new Set(['http:', 'https:'])

/**
 * Resolves the upstream URL for a proxy target.
 *
 * The authority (protocol, host, port) is taken solely from `new URL(target)`.
 * The pathname is intentionally NOT re-parsed against the origin: re-parsing a
 * pathname that begins with `//` or `/\` would promote it to a protocol-relative
 * authority, letting request-derived path data hijack the upstream host (SSRF).
 * Only `http:`/`https:` targets are permitted.
 *
 * @param target - The proxy target URL string.
 * @param allowedHosts - Optional allowlist of upstream hostnames. When provided,
 *   the resolved hostname must match one entry (string = case-insensitive exact
 *   match, RegExp = tested against the hostname); otherwise the request is
 *   rejected. An empty array denies every host.
 * @returns A `URL` whose authority is fixed to the parsed target.
 * @throws HttpError(502) if the target is not a valid `http:`/`https:` URL or its
 *   host is not in `allowedHosts`.
 */
export function resolveProxyTarget(target: string, allowedHosts?: Array<string | RegExp>): URL {
  let url: URL
  try {
    url = new URL(target)
  } catch {
    throw new HttpError(502, 'Invalid proxy target URL')
  }
  if (!ALLOWED_PROXY_PROTOCOLS.has(url.protocol)) {
    throw new HttpError(502, `Proxy target protocol "${url.protocol}" is not allowed`)
  }
  if (allowedHosts && !isHostAllowed(url.hostname, allowedHosts)) {
    throw new HttpError(502, `Proxy target host "${url.hostname}" is not allowed`)
  }
  url.hash = ''
  return url
}

function isHostAllowed(hostname: string, allowedHosts: Array<string | RegExp>): boolean {
  const lower = hostname.toLowerCase()
  return allowedHosts.some((entry) =>
    typeof entry === 'string' ? entry.toLowerCase() === lower : entry.test(hostname),
  )
}

class IterableRecords {
  [Symbol.iterator]() {
    return this
  }

  protected index = 0

  next(): IteratorResult<[string, string]> {
    return { value: undefined, done: true }
  }
}

export class CookiesIterable extends IterableRecords {
  private readonly cookies: string[]

  constructor(cookiesString: string) {
    super()
    this.cookies = cookiesString.split(/,\s(?!\d{2}[\s-])/u)
  }

  next(): IteratorResult<[string, string]> {
    const str = this.cookies[this.index++]
    const ind = str ? str.indexOf('=') : 0
    return this.index <= this.cookies.length
      ? {
          value: [str.slice(0, ind), str.slice(ind + 1)] as [string, string],
          done: false,
        }
      : { value: undefined, done: true }
  }
}

export class HeadersIterable extends IterableRecords {
  private readonly entries: Array<[string, string]>

  constructor(headers: Record<string, string> | IncomingHttpHeaders) {
    super()
    this.entries = Object.entries(headers) as Array<[string, string]>
  }

  next(): IteratorResult<[string, string]> {
    return this.index < this.entries.length
      ? { value: this.entries[this.index++], done: false }
      : { value: undefined, done: true }
  }
}

export function applyProxyControls(
  records: IterableIterator<[string, string]>,
  controls: TWooksProxyControls,
  additionalBlockers?: string[],
): Record<string, string> {
  let result: Record<string, string> = {}
  const { allow, block, overwrite } = controls
  const defaultedAllow = allow || '*'
  if (defaultedAllow) {
    for (const [name, value] of records) {
      const add =
        block !== '*' &&
        (!additionalBlockers || !additionalBlockers.includes(name)) &&
        (defaultedAllow === '*' ||
          defaultedAllow.find(
            (item) =>
              (typeof item === 'string' && name.toLowerCase() === item.toLowerCase()) ||
              (item instanceof RegExp && item.test(name)),
          )) &&
        !block?.find(
          (item) =>
            (typeof item === 'string' && name.toLowerCase() === item.toLowerCase()) ||
            (item instanceof RegExp && item.test(name)),
        )
      if (add) {
        result[name] = value
      }
    }
  }

  if (overwrite) {
    if (typeof overwrite === 'function') {
      result = overwrite(result)
    } else {
      result = { ...result, ...overwrite }
    }
  }
  return result
}
