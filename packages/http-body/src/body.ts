import { cached, defineWook } from '@wooksjs/event-core'
import type { EventContext } from '@wooksjs/event-core'
import {
  EHttpStatusCode,
  HttpError,
  seedRawBody,
  useHeaders,
  useRequest,
  WooksURLSearchParams,
} from '@wooksjs/event-http'
import { Buffer } from 'buffer'

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

/** The body's content type: the request's `content-type` header, or what {@link seedBody} set. */
const contentTypeSlot = cached((ctx: EventContext) => useHeaders(ctx)['content-type'] || '')

const parsedBodySlot = cached(async (ctx: EventContext) => {
  const { rawBody } = useRequest(ctx)
  const contentType = ctx.get(contentTypeSlot)
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
export const useBody = defineWook((ctx: EventContext) => bodyApi(ctx, false))

/** `ownParse`: parse in `ctx` itself, never reading a parent's parsed body through. */
function bodyApi(ctx: EventContext, ownParse: boolean) {
  const { rawBody } = useRequest(ctx)

  return {
    is: (type: KnownContentType | (string & {})) =>
      ctx.get(contentTypeSlot).includes(CONTENT_TYPE_MAP[type] || type),
    parseBody: <T>() =>
      (ownParse ? ctx.getOwn(parsedBodySlot) : ctx.get(parsedBodySlot)) as Promise<T>,
    rawBody,
  }
}

/** Options for {@link seedBody}. */
export interface TSeedBodyOptions {
  /**
   * The raw bytes `rawBody()` returns. Default: `body` itself when it is a string or a
   * `Buffer`, otherwise `JSON.stringify(body)`. With `body` `undefined`, `parseBody()` parses
   * these bytes by the content type (as for a real request).
   */
  raw?: Buffer | string
  /**
   * The content type `useBody().is()` checks against (and `parseBody()` parses `raw` by).
   * Default: `'text/plain'` for a string, `'application/octet-stream'` for a `Buffer`,
   * `'application/json'` for other values; with `body` `undefined`, the request's
   * `Content-Type`. Request headers (`useHeaders()`) are not changed.
   */
  contentType?: string
}

/**
 * Seeds the request body of `ctx` with an already parsed value: `useBody(ctx).parseBody()`
 * resolves to `body`, `useBody(ctx).rawBody()` / `useRequest(ctx).rawBody()` to its raw bytes,
 * and `useBody(ctx).is()` checks the seeded content type — the incoming request stream is never
 * read.
 *
 * Use it for a child event context (`new EventContext({ logger, parent })`) that runs a handler
 * with its own payload: everything else (request, headers, auth) is still read through the
 * parent, the body never is. Call it before anything in the child reads the body.
 *
 * @param ctx - The context to seed — usually a child of the current HTTP event
 * @param body - The parsed body value
 * @param opts - Raw bytes and content type (see {@link TSeedBodyOptions})
 *
 * @example
 * ```ts
 * const child = new EventContext({ logger: parent.logger, parent })
 * seedBody(child, { ids: [1, 2] })
 * await run(child, async () => {
 *   await useBody().parseBody() // { ids: [1, 2] }
 *   useBody().is('json') // true
 * })
 * ```
 */
export function seedBody(ctx: EventContext, body: unknown, opts?: TSeedBodyOptions): void {
  const defaults = seedDefaults(body, opts?.raw)
  seedRawBody(ctx, defaults.raw)
  const contentType = opts?.contentType ?? defaults.contentType
  if (contentType !== undefined) {
    ctx.setOwn(contentTypeSlot, contentType)
  }
  // `undefined` + `raw`: parseBody() parses the seeded bytes by content type
  const parseRaw = body === undefined && opts?.raw !== undefined
  if (!parseRaw) {
    ctx.setOwn(parsedBodySlot, Promise.resolve(body))
  }
  if (parseRaw || ctx.parent) {
    // A `useBody()` the parent already built is bound to the parent's body —
    // give the child its own instance.
    ctx.setOwn(useBody._slot, bodyApi(ctx, true))
  }
}

/** The raw bytes (`raw`, else derived from `body`) and default content type of a seeded body. */
function seedDefaults(
  body: unknown,
  raw: Buffer | string | undefined,
): { raw: Buffer | string; contentType?: string } {
  if (body === undefined) {
    return { raw: raw ?? '' }
  }
  if (typeof body === 'string') {
    return { raw: raw ?? body, contentType: CONTENT_TYPE_MAP.text }
  }
  if (Buffer.isBuffer(body)) {
    return { raw: raw ?? body, contentType: CONTENT_TYPE_MAP.binary }
  }
  return { raw: raw ?? JSON.stringify(body) ?? '', contentType: CONTENT_TYPE_MAP.json }
}
