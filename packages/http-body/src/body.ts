/* eslint-disable unicorn/no-await-expression-member */
/* eslint-disable no-sparse-arrays */
/* eslint-disable max-depth */
import {
  EHttpStatusCode,
  HttpError,
  useHeaders,
  useHttpContext,
  useRequest,
  WooksURLSearchParams,
} from '@wooksjs/event-http'

import { safeJsonParse } from './utils/safe-json'

interface TBodyStore {
  parsed?: Promise<unknown>
  isJson?: boolean
  isHtml?: boolean
  isText?: boolean
  isBinary?: boolean
  isXml?: boolean
  isFormData?: boolean
  isUrlencoded?: boolean
}

export function useBody() {
  const { store } = useHttpContext<{ request: TBodyStore }>()
  const { init } = store('request')
  const { rawBody } = useRequest()
  const { 'content-type': contentType } = useHeaders()

  function contentIs(type: string) {
    return (contentType || '').includes(type)
  }

  const isJson = () => init('isJson', () => contentIs('application/json'))
  const isHtml = () => init('isHtml', () => contentIs('text/html'))
  const isXml = () => init('isXml', () => contentIs('text/xml'))
  const isText = () => init('isText', () => contentIs('text/plain'))
  const isBinary = () => init('isBinary', () => contentIs('application/octet-stream'))
  const isFormData = () => init('isFormData', () => contentIs('multipart/form-data'))
  const isUrlencoded = () =>
    init('isUrlencoded', () => contentIs('application/x-www-form-urlencoded'))

  const parseBody = <T>() =>
    init('parsed', async () => {
      const body = await rawBody()
      const sBody = body.toString()
      if (isJson()) {
        return jsonParser(sBody)
      } else if (isFormData()) {
        return formDataParser(sBody)
      } else if (isUrlencoded()) {
        return urlEncodedParser(sBody)
      } else if (isBinary()) {
        return textParser(sBody)
      } else {
        return textParser(sBody)
      }
    }) as Promise<T>

  function jsonParser(v: string): Record<string, unknown> | unknown[] {
    try {
      return safeJsonParse<Record<string, unknown> | unknown[]>(v)
    } catch (error) {
      throw new HttpError(400, (error as Error).message)
    }
  }
  function textParser(v: string): string {
    return v
  }

  function formDataParser(v: string): Record<string, unknown> {
    /* ───── per-request limits ───── */
    const MAX_PARTS = 255 // total fields
    const MAX_KEY_LENGTH = 100 // bytes
    const MAX_VALUE_LENGTH = 100 * 1024 // 100 KB per field

    /* boundary detection (unchanged) */
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
        .map(l => l.trim())

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
          // we concatenate if keys are the same
          // if (key in result && !Array.isArray(result[key])) {
          //   throw new HttpError(400, `Duplicate key "${key}"`)
          // }
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

  return {
    isJson,
    isHtml,
    isXml,
    isText,
    isBinary,
    isFormData,
    isUrlencoded,
    parseBody,
    rawBody,
  }
}
