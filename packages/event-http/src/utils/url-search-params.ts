import { URLSearchParams } from 'url'

import { HttpError } from '../errors'

const ILLEGAL_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

/**
 * Extended `URLSearchParams` with safe JSON conversion.
 *
 * Rejects prototype-pollution keys (`__proto__`, `constructor`, `prototype`) and duplicate non-array keys.
 * Array parameters are detected by a trailing `[]` in the key name (e.g. `tags[]=a&tags[]=b`).
 */
export class WooksURLSearchParams extends URLSearchParams {
  /** Converts query parameters to a plain object. Array params (keys ending with `[]`) become `string[]`. */
  toJson<T = unknown>(): T {
    const json = Object.create(null) as Record<string, unknown>
    for (const [key, value] of this.entries()) {
      if (isArrayParam(key)) {
        const a = (json[key] = (json[key] || []) as string[])
        a.push(value)
      } else {
        if (ILLEGAL_KEYS.has(key)) {
          throw new HttpError(400, `Illegal key name "${key}"`)
        }
        if (key in json) {
          throw new HttpError(400, `Duplicate key "${key}"`)
        }
        json[key] = value
      }
    }
    return json as T
  }
}

function isArrayParam(name: string) {
  return name.endsWith('[]')
}
