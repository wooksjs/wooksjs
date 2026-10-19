import { HttpError } from '@wooksjs/event-http'

const ILLEGAL_KEYS = ['__proto__', 'constructor', 'prototype'] as const

// One pass for all illegal names; `\u` stays a separate includes() — folding it in is ~3x slower
const ILLEGAL_KEY_RE = new RegExp(ILLEGAL_KEYS.join('|'))

/**
 * `JSON.parse` that rejects `__proto__` / `constructor` / `prototype` keys (400).
 *
 * A parsed key can only spell an illegal name when the source contains that name literally
 * or uses a `\u` escape, so the key walk is skipped for sources that contain neither.
 */
export function safeJsonParse<T>(src: string): T {
  const parsed = JSON.parse(src) as T
  if (src.includes('\\u') || ILLEGAL_KEY_RE.test(src)) {
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
