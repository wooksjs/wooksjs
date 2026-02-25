import { HttpError } from '@wooksjs/event-http'

const ILLEGAL_KEYS = ['__proto__', 'constructor', 'prototype'] as const

export function safeJsonParse<T>(src: string): T {
  const parsed = JSON.parse(src) as T
  assertNoProtoKeys(parsed)
  return parsed
}

function assertNoProtoKeys(obj: unknown): void {
  if (obj === null || typeof obj !== 'object') {
    return
  }
  if (Array.isArray(obj)) {
    for (const item of obj) {
      assertNoProtoKeys(item)
    }
    return
  }
  const record = obj as Record<string, unknown>
  for (const key of Object.keys(record)) {
    if (key === ILLEGAL_KEYS[0] || key === ILLEGAL_KEYS[1] || key === ILLEGAL_KEYS[2]) {
      throw new HttpError(400, `Illegal key name "${key}"`)
    }
    assertNoProtoKeys(record[key])
  }
}
