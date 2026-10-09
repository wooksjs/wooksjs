import { HttpError } from '@wooksjs/event-http'

const ILLEGAL_KEYS = ['__proto__', 'constructor', 'prototype'] as const

/**
 * `JSON.parse` that rejects `__proto__` / `constructor` / `prototype` keys (400).
 *
 * A parsed key can only spell an illegal name when the source contains that name literally
 * or uses a `\u` escape, so the key walk is skipped for sources that contain neither.
 */
export function safeJsonParse<T>(src: string): T {
  const parsed = JSON.parse(src) as T
  if (
    src.includes('__proto__') ||
    src.includes('constructor') ||
    src.includes('prototype') ||
    src.includes('\\u')
  ) {
    assertNoProtoKeys(parsed)
  }
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
