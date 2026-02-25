import { cached, defineWook, useEventId } from '@wooksjs/event-core'
import type { EventContext } from '@wooksjs/event-core'
import { Buffer } from 'buffer'

import {
  compressors,
  encodingSupportsStream,
  uncompressBody,
  uncompressBodyStream,
} from '../compressor'
import { HttpError } from '../errors'
import { httpKind } from '../http-kind'

const xForwardedFor = 'x-forwarded-for'

/** Default safety limits for request body reading (size, ratio, timeout). */
export const DEFAULT_LIMITS = {
  maxCompressed: 1 * 1024 * 1024, // 1 MB
  maxInflated: 10 * 1024 * 1024, // 10 MB
  maxRatio: 100, // 100× expansion
  readTimeoutMs: 10_000, // 10 s
} as const

const contentEncodingsSlot = cached((ctx: EventContext) => {
  const req = ctx.get(httpKind.keys.req)
  const contentEncoding = req.headers['content-encoding']
  return (contentEncoding || '')
    .split(',')
    .map((p) => p.trim())
    .filter((p) => !!p)
})

const isCompressedSlot = cached((ctx: EventContext) => {
  const parts = ctx.get(contentEncodingsSlot)
  for (const p of parts) {
    if (['deflate', 'gzip', 'br'].includes(p)) {
      return true
    }
  }
  return false
})

/** @internal Exported for test pre-seeding via `ctx.set(rawBodySlot, ...)`. */
export const rawBodySlot = cached(async (ctx: EventContext): Promise<Buffer> => {
  const req = ctx.get(httpKind.keys.req)
  const encs = ctx.get(contentEncodingsSlot)
  const isZip = ctx.get(isCompressedSlot)
  const streamable = isZip && encodingSupportsStream(encs)

  const limits = ctx.get(httpKind.keys.requestLimits)
  const maxCompressed = limits?.maxCompressed ?? DEFAULT_LIMITS.maxCompressed
  const maxInflated = limits?.maxInflated ?? DEFAULT_LIMITS.maxInflated
  const maxRatio = limits?.maxRatio ?? DEFAULT_LIMITS.maxRatio
  const timeoutMs = limits?.readTimeoutMs ?? DEFAULT_LIMITS.readTimeoutMs

  /* fast-fail by Content-Length, if header present */
  const cl = Number(req.headers['content-length'] ?? 0)
  const upfrontLimit = isZip ? maxCompressed : maxInflated
  if (cl && cl > upfrontLimit) {
    throw new HttpError(413, 'Payload Too Large')
  }

  /* fast-fail if any encoding is not supported */
  for (const enc of encs) {
    if (!compressors[enc]) {
      throw new HttpError(415, `Unsupported Content-Encoding "${enc}"`)
    }
  }

  /* optional timeout */
  let timer: NodeJS.Timeout | null = null

  function resetTimer() {
    if (timeoutMs === 0) {
      return
    }
    clearTimer()
    timer = setTimeout(() => {
      clearTimer()
      req.destroy()
    }, timeoutMs)
  }
  function clearTimer() {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  /* async generator that reads from req with limits */
  let rawBytes = 0
  async function* limitedCompressed(): AsyncIterable<Buffer> {
    resetTimer()
    try {
      for await (const chunk of req) {
        rawBytes += (chunk as Buffer).length
        if (rawBytes > upfrontLimit) {
          req.destroy()
          throw new HttpError(413, 'Payload Too Large')
        }
        resetTimer() // keep-alive
        yield chunk
      }
    } finally {
      clearTimer()
    }
  }

  /* build pipeline (maybe just the generator itself) */
  let stream: AsyncIterable<Buffer> = limitedCompressed()
  if (streamable) {
    stream = await uncompressBodyStream(encs, stream)
  }

  /* collect output while enforcing inflated limits */
  const chunks: Buffer[] = []
  let inflatedBytes = 0
  try {
    for await (const chunk of stream) {
      inflatedBytes += chunk.length
      if (inflatedBytes > maxInflated) {
        throw new HttpError(413, 'Inflated body too large')
      }
      chunks.push(chunk)
    }
  } catch (error) {
    // convert generic error from req.destroy() into an HTTP error
    if (error instanceof HttpError) {
      throw error
    } // size limit etc.
    throw new HttpError(408, 'Request body timeout')
  }

  /* if we could not stream-decompress, do it now (buffer) */
  let body: Buffer = Buffer.concat(chunks)

  if (!streamable && isZip) {
    body = await uncompressBody(encs, body)
    inflatedBytes = body.byteLength
    if (inflatedBytes > maxInflated) {
      throw new HttpError(413, 'Inflated body too large')
    }
  }

  /* compression ratio check (zip-bomb mitigation) */
  if (isZip && rawBytes > 0 && inflatedBytes / rawBytes > maxRatio) {
    throw new HttpError(413, 'Compression ratio too high')
  }

  return body // always decompressed
})

const forwardedIpSlot = cached((ctx: EventContext) => {
  const req = ctx.get(httpKind.keys.req)
  if (typeof req.headers[xForwardedFor] === 'string' && req.headers[xForwardedFor]) {
    return req.headers[xForwardedFor].split(',').shift()?.trim()!
  }
  return ''
})

const remoteIpSlot = cached((ctx: EventContext) => {
  const req = ctx.get(httpKind.keys.req)
  return req.socket.remoteAddress || req.connection.remoteAddress || ''
})

const ipListSlot = cached((ctx: EventContext) => {
  const req = ctx.get(httpKind.keys.req)
  return {
    remoteIp: req.socket.remoteAddress || req.connection.remoteAddress || '',
    forwarded: ((req.headers[xForwardedFor] as string) || '').split(',').map((s) => s.trim()),
  }
})

/**
 * Provides access to the incoming HTTP request (method, url, headers, body, IP).
 * @example
 * ```ts
 * const { method, url, raw, rawBody, getIp } = useRequest()
 * const body = await rawBody()
 * ```
 */
export const useRequest = defineWook((ctx: EventContext) => {
  const req = ctx.get(httpKind.keys.req)

  const limits = () => ctx.get(httpKind.keys.requestLimits)
  const setLimit = (limitKey: keyof typeof DEFAULT_LIMITS, value: number) => {
    let obj = limits()
    if (!obj?.perRequest) {
      obj = { ...obj, perRequest: true }
      ctx.set(httpKind.keys.requestLimits, obj)
    }
    obj[limitKey] = value
  }

  const getMaxCompressed = () => limits()?.maxCompressed ?? DEFAULT_LIMITS.maxCompressed
  const setMaxCompressed = (limit: number) => setLimit('maxCompressed', limit)
  const getMaxInflated = () => limits()?.maxInflated ?? DEFAULT_LIMITS.maxInflated
  const setMaxInflated = (limit: number) => setLimit('maxInflated', limit)
  const getMaxRatio = () => limits()?.maxRatio ?? DEFAULT_LIMITS.maxRatio
  const setMaxRatio = (limit: number) => setLimit('maxRatio', limit)
  const getReadTimeoutMs = () => limits()?.readTimeoutMs ?? DEFAULT_LIMITS.readTimeoutMs
  const setReadTimeoutMs = (limit: number) => setLimit('readTimeoutMs', limit)

  function getIp(options?: { trustProxy: boolean }): string {
    if (options?.trustProxy) {
      return ctx.get(forwardedIpSlot) || ctx.get(remoteIpSlot)
    }
    return ctx.get(remoteIpSlot)
  }

  return {
    raw: req,
    url: req.url,
    method: req.method,
    headers: req.headers,
    rawBody: () => ctx.get(rawBodySlot),
    reqId: useEventId(ctx).getId,
    getIp,
    getIpList: () => ctx.get(ipListSlot),
    isCompressed: () => ctx.get(isCompressedSlot),

    // limits
    getMaxCompressed,
    setMaxCompressed,
    getReadTimeoutMs,
    setReadTimeoutMs,
    getMaxInflated,
    setMaxInflated,
    getMaxRatio,
    setMaxRatio,
  }
})
