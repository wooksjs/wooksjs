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

import type { TBodyCompressor } from './utils/body-compressor'
import { compressors, uncompressBody } from './utils/body-compressor'

interface TBodyStore {
  parsed?: Promise<unknown>
  isJson?: boolean
  isHtml?: boolean
  isText?: boolean
  isBinary?: boolean
  isXml?: boolean
  isFormData?: boolean
  isUrlencoded?: boolean
  isCompressed?: boolean
  contentEncodings?: string[]
}

export function useBody() {
  const { store } = useHttpContext<{ request: TBodyStore }>()
  const { init } = store('request')
  const { rawBody } = useRequest()
  const { 'content-type': contentType, 'content-encoding': contentEncoding } = useHeaders()

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
  const isCompressed = () =>
    init('isCompressed', () => {
      const parts = contentEncodings()
      for (const p of parts) {
        if (['deflate', 'gzip', 'br'].includes(p)) {
          return true
        }
      }
      return false
    })

  const contentEncodings = () =>
    init('contentEncodings', () =>
      (contentEncoding || '')
        .split(',')
        .map(p => p.trim())
        .filter(p => !!p)
    )

  const parseBody = <T>() =>
    init('parsed', async () => {
      const body = await uncompressBody(contentEncodings(), (await rawBody()).toString())
      if (isJson()) {
        return jsonParser(body)
      } else if (isFormData()) {
        return formDataParser(body)
      } else if (isUrlencoded()) {
        return urlEncodedParser(body)
      } else if (isBinary()) {
        return textParser(body)
      } else {
        return textParser(body)
      }
    }) as Promise<T>

  function jsonParser(v: string): Record<string, unknown> | unknown[] {
    try {
      return JSON.parse(v) as Record<string, unknown> | unknown[]
    } catch (error) {
      throw new HttpError(400, (error as Error).message)
    }
  }
  function textParser(v: string): string {
    return v
  }

  function formDataParser(v: string): Record<string, unknown> {
    const boundary = `--${(/boundary=([^;]+)(?:;|$)/u.exec(contentType || '') || [, ''])[1]}`
    if (!boundary) {
      throw new HttpError(EHttpStatusCode.BadRequest, 'form-data boundary not recognized')
    }
    const parts = v.trim().split(boundary)
    const result: Record<string, unknown> = {}
    let key = ''
    let partContentType = 'text/plain'
    for (const part of parts) {
      parsePart()
      key = ''
      partContentType = 'text/plain'
      let valueMode = false
      const lines = part
        .trim()
        .split(/\n/u)
        .map(s => s.trim())
      for (const line of lines) {
        if (valueMode) {
          if (result[key]) {
            // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
            result[key] += `\n${line}`
          } else {
            result[key] = line
          }
        } else {
          if (!line || line === '--') {
            valueMode = !!key
            if (valueMode) {
              key = key.replace(/^["']/u, '').replace(/["']$/u, '')
            }
            continue
          }
          if (line.toLowerCase().startsWith('content-disposition: form-data;')) {
            key = (/name=([^;]+)/.exec(line) || [])[1]
            if (!key) {
              throw new HttpError(
                EHttpStatusCode.BadRequest,
                `Could not read multipart name: ${line}`
              )
            }
            continue
          }
          if (line.toLowerCase().startsWith('content-type:')) {
            partContentType = (/content-type:\s?([^;]+)/i.exec(line) || [])[1]
            if (!partContentType) {
              throw new HttpError(
                EHttpStatusCode.BadRequest,
                `Could not read content-type: ${line}`
              )
            }
            continue
          }
        }
      }
    }
    parsePart()
    function parsePart() {
      if (key && partContentType.includes('application/json')) {
        result[key] = JSON.parse(result[key] as string)
      }
    }
    return result
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
    isCompressed,
    contentEncodings,
    parseBody,
    rawBody,
  }
}

export function registerBodyCompressor(name: string, compressor: TBodyCompressor) {
  if (compressors[name]) {
    throw new Error(`Body compressor "${name}" already registered.`)
  }
  compressors[name] = compressor
}
