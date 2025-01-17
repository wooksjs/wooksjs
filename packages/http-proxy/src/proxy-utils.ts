import type { IncomingHttpHeaders } from 'http'

import type { TWooksProxyControls } from './types'

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
  additionalBlockers?: string[]
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
            item =>
              (typeof item === 'string' && name.toLowerCase() === item.toLowerCase()) ||
              (item instanceof RegExp && item.test(name))
          )) &&
        !block?.find(
          item =>
            (typeof item === 'string' && name.toLowerCase() === item.toLowerCase()) ||
            (item instanceof RegExp && item.test(name))
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
