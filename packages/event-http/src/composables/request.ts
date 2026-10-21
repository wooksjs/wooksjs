import { cached, defineWook, useEventId } from '@wooksjs/event-core'
import type { EventContext } from '@wooksjs/event-core'
import { Buffer } from 'buffer'
import type { IncomingMessage } from 'http'

import {
  compressors,
  encodingSupportsStream,
  uncompressBody,
  uncompressBodyStream,
} from '../compressor'
import { HttpError } from '../errors'
import { getHttpAppConfig } from '../http-config'
import { httpKind } from '../http-kind'
import { normalizeAddress, resolveForwarded } from '../utils/proxy'
import type { TForwardedInfo, TForwardedIssue, TTrustProxyFn } from '../utils/proxy'

const xForwardedFor = 'x-forwarded-for'

/** Default safety limits for request body reading (size, ratio, timeout). */
export const DEFAULT_LIMITS = {
  maxCompressed: 1 * 1024 * 1024, // 1 MB
  maxInflated: 10 * 1024 * 1024, // 10 MB
  maxRatio: 100, // 100× expansion
  readTimeoutMs: 10_000, // 10 s
} as const

const NO_ENCODINGS: readonly string[] = Object.freeze([])

const contentEncodingsSlot = cached((ctx: EventContext): readonly string[] => {
  const contentEncoding = ctx.get(httpKind.keys.req).headers['content-encoding']
  if (!contentEncoding) {
    return NO_ENCODINGS
  }
  return contentEncoding
    .split(',')
    .map((p) => p.trim())
    .filter((p) => !!p)
})

const isCompressedSlot = cached((ctx: EventContext) => {
  for (const p of ctx.get(contentEncodingsSlot)) {
    if (p === 'deflate' || p === 'gzip' || p === 'br') {
      return true
    }
  }
  return false
})

/**
 * Reads the whole request body with plain stream events (one listener set, one timer).
 * Raw bytes are checked against `upfrontLimit` first, then against `maxInflated`
 * (the same order as the streaming path). A stall longer than `timeoutMs` destroys the
 * request; a premature close or stream error becomes 408. The request is destroyed
 * once reading settles, as async iteration did.
 */
function readRawBody(
  req: IncomingMessage,
  upfrontLimit: number,
  maxInflated: number,
  timeoutMs: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let bytes = 0
    if (req.readableEnded) {
      req.destroy()
      resolve(Buffer.alloc(0))
      return
    }
    if (req.destroyed) {
      reject(new HttpError(408, 'Request body timeout'))
      return
    }
    let done = false
    const timer = timeoutMs === 0 ? null : setTimeout(() => req.destroy(), timeoutMs)
    const finish = (error?: HttpError) => {
      if (done) {
        return
      }
      done = true
      if (timer) {
        clearTimeout(timer)
      }
      req.off('data', onData)
      req.off('end', onEnd)
      req.off('error', onAbort)
      req.off('close', onAbort)
      req.destroy()
      if (error) {
        reject(error)
      } else {
        resolve(chunks.length === 1 ? chunks[0] : Buffer.concat(chunks, bytes))
      }
    }
    const onData = (chunk: Buffer) => {
      bytes += chunk.length
      if (bytes > upfrontLimit) {
        finish(new HttpError(413, 'Payload Too Large'))
        return
      }
      if (bytes > maxInflated) {
        finish(new HttpError(413, 'Inflated body too large'))
        return
      }
      timer?.refresh()
      chunks.push(chunk)
    }
    const onEnd = () => finish()
    const onAbort = () => finish(new HttpError(408, 'Request body timeout'))
    req.on('data', onData)
    req.on('end', onEnd)
    req.on('error', onAbort)
    req.on('close', onAbort)
    req.resume()
  })
}

/** @internal Exported for test pre-seeding — use {@link seedRawBody} instead. */
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

  if (!streamable) {
    /* plain (or buffer-only compressed) body: event-based read, then decompress if needed */
    const raw = await readRawBody(req, upfrontLimit, maxInflated, timeoutMs)
    if (!isZip) {
      return raw
    }
    const body = await uncompressBody(encs, raw)
    if (body.byteLength > maxInflated) {
      throw new HttpError(413, 'Inflated body too large')
    }
    /* compression ratio check (zip-bomb mitigation) */
    if (raw.byteLength > 0 && body.byteLength / raw.byteLength > maxRatio) {
      throw new HttpError(413, 'Compression ratio too high')
    }
    return body
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

  /* streaming decompression pipeline */
  const stream = await uncompressBodyStream(encs, limitedCompressed())

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

  /* compression ratio check (zip-bomb mitigation) */
  if (rawBytes > 0 && inflatedBytes / rawBytes > maxRatio) {
    throw new HttpError(413, 'Compression ratio too high')
  }

  return Buffer.concat(chunks) // always decompressed
})

/** @internal The client as resolved through the app's `trustProxy` (see `resolveForwarded`). */
export const forwardedSlot = cached((ctx: EventContext): TForwardedInfo => {
  const { trustProxy, proxyHeaders } = getHttpAppConfig(ctx)
  // issues arise only while walking a trusted chain
  const onIssue = trustProxy ? (issue: TForwardedIssue) => reportIssue(ctx, issue) : undefined
  return resolveForwarded(ctx.get(httpKind.keys.req), trustProxy, proxyHeaders, onIssue)
})

/** Diagnostics (and the deprecation notice) are logged once per kind per process. */
const warnedIssues = new Set<string>()

function reportIssue(ctx: EventContext, issue: TForwardedIssue): void {
  if (warnedIssues.has(issue.kind)) {
    return
  }
  warnedIssues.add(issue.kind)
  if (issue.kind === 'trust-error') {
    ctx.logger.error('trustProxy predicate threw — no proxy trusted for this request', issue.error)
  } else {
    ctx.logger.warn(
      `The ${issue.header} entry your own proxy (the socket peer) wrote is malformed, so clients ` +
        `resolve to an unknown address (''): ${JSON.stringify(issue.value.slice(0, 200))}. ` +
        'Check the proxy configuration (e.g. quote IPv6 in Forwarded: for="[2001:db8::1]").',
    )
  }
}

const trustOneHop: TTrustProxyFn = (_addr, i) => i < 1

/** Deprecated `getIp({ trustProxy: true })`: trust exactly one hop. */
const oneHopIpSlot = cached(
  (ctx: EventContext) =>
    resolveForwarded(ctx.get(httpKind.keys.req), trustOneHop, getHttpAppConfig(ctx).proxyHeaders)
      .ip,
)

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
 * Provides access to the incoming HTTP request (method, url, headers, body, client IP,
 * protocol and host — the last three through the app's `trustProxy` setting).
 * @example
 * ```ts
 * const { method, url, raw, rawBody, getIp, protocol, host } = useRequest()
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

  /**
   * Client IP. Without arguments it follows the app's `trustProxy` setting: the socket peer when
   * no proxy is trusted (the default), otherwise the right-most hop that is not a trusted proxy.
   *
   * @param options - **Deprecated**: `{ trustProxy: true }` trusts exactly one proxy hop (the
   *   right-most forwarded address — not the left-most, which any client can forge);
   *   `{ trustProxy: false }` returns the socket peer. Configure `trustProxy` on the app instead.
   */
  /** The socket peer, normalised — the client when no proxy is trusted (computed once). */
  let peerIp: string | undefined

  function getIp(options?: { trustProxy: boolean }): string {
    if (options) {
      if (!warnedIssues.has('legacy-get-ip')) {
        warnedIssues.add('legacy-get-ip')
        ctx.logger.warn(
          'useRequest().getIp({ trustProxy }) is deprecated: set `trustProxy` on the HTTP app ' +
            '(e.g. createHttpApp({ trustProxy: 1 })) and call getIp() without arguments.',
        )
      }
      return options.trustProxy ? ctx.get(oneHopIpSlot) : ctx.get(remoteIpSlot)
    }
    // No proxy trusted and no client handed down (an in-process fetch seeds the caller's):
    // the socket peer, without reading any header
    if (!getHttpAppConfig(ctx).trustProxy && !ctx.has(forwardedSlot)) {
      return (peerIp ??= normalizeAddress(req.socket?.remoteAddress ?? ''))
    }
    return ctx.get(forwardedSlot).ip
  }

  return {
    raw: req,
    url: req.url,
    method: req.method,
    headers: req.headers,
    rawBody: () => ctx.get(rawBodySlot),
    reqId: useEventId(ctx).getId,
    getIp,
    /**
     * `'https'` or `'http'` as the client used it: from the trusted proxy chain
     * (`X-Forwarded-Proto` / `Forwarded: proto=`) when the app trusts proxies, else the socket's.
     */
    protocol: () => ctx.get(forwardedSlot).protocol,
    /**
     * The host (with port, if any) the client asked for: from the trusted proxy chain
     * (`X-Forwarded-Host` / `Forwarded: host=`) when the app trusts proxies, else the `Host` header.
     */
    host: () => ctx.get(forwardedSlot).host,
    /** Raw addresses: socket peer and every `X-Forwarded-For` entry, unvalidated (client-forgeable). */
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

/**
 * Seeds the raw request body of `ctx`: `useRequest(ctx).rawBody()` resolves to `raw` instead of
 * reading the incoming request stream. To seed what `useBody()` (`@wooksjs/http-body`) parses,
 * use its `seedBody()` — a parent's already parsed body is otherwise read through.
 *
 * Use it for a child event context (`new EventContext({ logger, parent })`) that runs a handler
 * with its own payload: the child still reads everything else (request, headers, auth) through
 * its parent, but never the parent's body. Call it before anything in the child reads the body.
 *
 * @param ctx - The context to seed — usually a child of the current HTTP event
 * @param raw - The body bytes (a string is encoded as UTF-8)
 *
 * @example
 * ```ts
 * const child = new EventContext({ logger: parent.logger, parent })
 * seedRawBody(child, JSON.stringify({ ids: [1, 2] }))
 * await run(child, () => useRequest().rawBody()) // Buffer of '{"ids":[1,2]}'
 * ```
 */
export function seedRawBody(ctx: EventContext, raw: Buffer | string): void {
  ctx.setOwn(rawBodySlot, Promise.resolve(Buffer.isBuffer(raw) ? raw : Buffer.from(raw)))
  if (ctx.parent) {
    // A `useRequest()` the parent already built is bound to the parent's body —
    // give the child its own instance so `rawBody()` resolves the seeded one.
    ctx.getOwn(useRequest._slot)
  }
}
