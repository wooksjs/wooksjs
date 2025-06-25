import { HttpError } from '@wooksjs/event-http'

const ILLEGAL_KEYS = ['__proto__', 'constructor', 'prototype'] as const
const illigalKeySet = new Set<string>(ILLEGAL_KEYS)

export function safeJsonParse<T>(src: string): T {
  return JSON.parse(src, (key, value) => {
    assertKey(key)
    return value as unknown
  }) as T
}

export function assertKey(k: string) {
  if (illigalKeySet.has(k)) {
    throw new HttpError(400, `Illegal key name "${k}"`)
  }
}
