import { cached, cachedBy, defineWook } from '@wooksjs/event-core'
import type { EventContext } from '@wooksjs/event-core'
import {
  EHttpStatusCode,
  HttpError,
  useHeaders,
  useRequest,
  WooksURLSearchParams,
} from '@wooksjs/event-http'

import { safeJsonParse } from './utils/safe-json'

/** Short names for common Content-Type values. */
export type KnownContentType =
  | 'json'
  | 'html'
  | 'xml'
  | 'text'
  | 'binary'
  | 'form-data'
  | 'urlencoded'

const CONTENT_TYPE_MAP: Record<string, string> = {
  json: 'application/json',
  html: 'text/html',
  xml: 'text/xml',
  text: 'text/plain',
  binary: 'application/octet-stream',
  'form-data': 'multipart/form-data',
  urlencoded: 'application/x-www-form-urlencoded',
}

const contentIsSlot = cachedBy((type: string, ctx: EventContext) => {
  const contentType = useHeaders(ctx)['content-type'] || ''
  const mime = CONTENT_TYPE_MAP[type] || type
  return contentType.includes(mime)
})

const parsedBodySlot = cached(async (ctx: EventContext) => {
  const { rawBody } = useRequest(ctx)
  const contentType = useHeaders(ctx)['content-type'] || ''
  const contentIs = (type: string) => contentType.includes(type)

  const body = await rawBody()
  const sBody = body.toString()

  if (contentIs('application/json')) {
    return jsonParser(sBody)
  } else if (contentIs('multipart/form-data')) {
    return formDataParser(sBody, contentType)
  } else if (contentIs('application/x-www-form-urlencoded')) {
    return urlEncodedParser(sBody)
  } else {
    return sBody
  }
})

function jsonParser(v: string): Record<string, unknown> | unknown[] {
  try {
    return safeJsonParse<Record<string, unknown> | unknown[]>(v)
  } catch (error) {
    throw new HttpError(400, (error as Error).message)
  }
}

function formDataParser(v: string, contentType: string): Record<string, unknown> {
  /* ───── per-request limits ───── */
  const MAX_PARTS = 255 // total fields
  const MAX_KEY_LENGTH = 100 // bytes
  const MAX_VALUE_LENGTH = 100 * 1024 // 100 KB per field

  /* boundary detection */
  const boundary = `--${(/boundary=([^;]+)(?:;|$)/u.exec(contentType || '') || [, ''])[1]}`
  if (!boundary) {
    throw new HttpError(EHttpStatusCode.BadRequest, 'form-data boundary not recognized')
  }

  const parts = v.trim().split(boundary)
  const result = Object.create(null) as Record<string, unknown>

  let key = ''
  let partContentType = 'text/plain'
  let partCount = 0

  /* ───── iterate over parts ───── */
  for (const part of parts) {
    parsePart() // flush previous part
    key = ''
    partContentType = 'text/plain'

    if (!part.trim() || part.trim() === '--') {
      continue
    }

    partCount++
    if (partCount > MAX_PARTS) {
      throw new HttpError(413, 'Too many form fields')
    }

    let valueMode = false
    const lines = part
      .trim()
      .split(/\n/u)
      .map((l) => l.trim())

    for (const line of lines) {
      if (valueMode) {
        /*  ─ value collection ─ */
        if (line.length + String(result[key] ?? '').length > MAX_VALUE_LENGTH) {
          throw new HttpError(413, `Field "${key}" is too large`)
        }
        result[key] = (result[key] ? `${result[key] as string}\n` : '') + line
        continue
      }

      /*  ─ header parsing ─ */
      if (!line) {
        valueMode = !!key
        continue
      }

      if (line.toLowerCase().startsWith('content-disposition: form-data;')) {
        key = (/name=([^;]+)/.exec(line) || [])[1].replace(/^["']|["']$/g, '') ?? ''
        if (!key) {
          throw new HttpError(400, `Could not read multipart name: ${line}`)
        }
        if (key.length > MAX_KEY_LENGTH) {
          throw new HttpError(413, 'Field name too long')
        }
        if (['__proto__', 'constructor', 'prototype'].includes(key)) {
          throw new HttpError(400, `Illegal key name "${key}"`)
        }
        continue
      }

      if (line.toLowerCase().startsWith('content-type:')) {
        partContentType = (/content-type:\s?([^;]+)/i.exec(line) || [])[1] ?? ''
        continue
      }
    }
  }
  parsePart() // flush last part

  return result

  /* ─ helper converts JSON sub-parts safely ─ */
  function parsePart() {
    if (key && partContentType.includes('application/json') && typeof result[key] === 'string') {
      result[key] = safeJsonParse(result[key] as string)
    }
  }
}

function urlEncodedParser(v: string): Record<string, unknown> {
  return new WooksURLSearchParams(v.trim()).toJson()
}

/**
 * Composable that provides request body parsing utilities for various content types.
 *
 * @example
 * ```ts
 * app.post('/api/data', async () => {
 *   const { is, parseBody } = useBody()
 *   if (is('json')) {
 *     const data = await parseBody<{ name: string }>()
 *     return { received: data.name }
 *   }
 * })
 * ```
 *
 * @returns Object with `is(type)` checker, `parseBody` function, and `rawBody` accessor.
 */
export const useBody = defineWook((ctx: EventContext) => {
  const { rawBody } = useRequest(ctx)

  return {
    is: (type: KnownContentType | (string & {})) => contentIsSlot(type, ctx),
    parseBody: <T>() => ctx.get(parsedBodySlot) as Promise<T>,
    rawBody,
  }
})
