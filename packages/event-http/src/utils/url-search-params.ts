import { URLSearchParams } from 'url'

import { HttpError } from '../errors'

export class WooksURLSearchParams extends URLSearchParams {
  toJson<T = unknown>(): T {
    const json = Object.create(null) as Record<string, unknown>
    for (const [key, value] of this.entries()) {
      if (isArrayParam(key)) {
        const a = (json[key] = (json[key] || []) as string[])
        a.push(value)
      } else {
        if (key === '__proto__') {
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
