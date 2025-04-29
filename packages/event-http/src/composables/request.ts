import { useEventId } from '@wooksjs/event-core'
import { Buffer } from 'buffer'

import {
  compressors,
  encodingSupportsStream,
  uncompressBody,
  uncompressBodyStream,
} from '../compressor'
import { HttpError } from '../errors'
import { useHttpContext } from '../event-http'

const xForwardedFor = 'x-forwarded-for'

export const DEFAULT_LIMITS = {
  maxCompressed: 1 * 1024 * 1024, // 1 MB
  maxInflated: 10 * 1024 * 1024, // 10 MB
  maxRatio: 100, // 100× expansion
  readTimeoutMs: 10_000, // 10 s
} as const

export function useRequest() {
  const { store } = useHttpContext()
  const { init, get, set } = store('request')
  const event = store('event')
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const req = event.get('req')!

  const contentEncoding = req.headers['content-encoding']

  const contentEncodings = () =>
    init('contentEncodings', () =>
      (contentEncoding || '')
        .split(',')
        .map(p => p.trim())
        .filter(p => !!p)
    )

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

  const getMaxCompressed = () => get('maxCompressed') ?? DEFAULT_LIMITS.maxCompressed
  const setMaxCompressed = (limit: number) => set('maxCompressed', limit)
  const getReadTimeoutMs = () => get('readTimeoutMs') ?? DEFAULT_LIMITS.readTimeoutMs
  const setReadTimeoutMs = (limit: number) => set('readTimeoutMs', limit)

  const getMaxInflated = () => get('maxInflated') ?? DEFAULT_LIMITS.maxInflated
  const setMaxInflated = (limit: number) => set('maxInflated', limit)
  // const getMaxRatio = () => get('maxRatio') ?? DEFAULT_LIMITS.maxRatio
  // const setMaxRatio = (limit: number) => set('maxRatio', limit)

  const rawBody = () =>
    init('rawBody', async (): Promise<Buffer> => {
      /* ───── config & helpers ───────────────────────────────────── */
      const encs = contentEncodings()
      const isZip = isCompressed()
      const streamable = isZip && encodingSupportsStream(encs)

      const maxCompressed = getMaxCompressed()
      const maxInflated = getMaxInflated()
      // const maxRatio = getMaxRatio()
      const timeoutMs = getReadTimeoutMs()

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

      /* ───── async generator that reads from req with limits ───── */
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

      /* ───── build pipeline (maybe just the generator itself) ──── */
      let stream: AsyncIterable<Buffer> = limitedCompressed()
      if (streamable) {
        stream = await uncompressBodyStream(encs, stream)
      }

      /* ───── collect output while enforcing inflated limits ────── */
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

      /* ───── if we could not stream-decompress, do it now (buffer) */
      let body: Buffer = Buffer.concat(chunks)

      if (!streamable && isZip) {
        body = await uncompressBody(encs, body)
        inflatedBytes = body.byteLength
        if (inflatedBytes > maxInflated) {
          throw new HttpError(413, 'Inflated body too large')
        }
      }

      return body // always decompressed
    })

  const reqId = useEventId().getId

  const forwardedIp = () =>
    init('forwardedIp', () => {
      if (typeof req.headers[xForwardedFor] === 'string' && req.headers[xForwardedFor]) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-asserted-optional-chain, @typescript-eslint/no-non-null-assertion
        return req.headers[xForwardedFor].split(',').shift()?.trim()!
      } else {
        return ''
      }
    })

  const remoteIp = () =>
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    init('remoteIp', () => req.socket.remoteAddress || req.connection.remoteAddress || '')!

  function getIp(options?: { trustProxy: boolean }): string {
    if (options?.trustProxy) {
      return forwardedIp() || getIp()
    } else {
      return remoteIp()
    }
  }

  const getIpList = () =>
    init('ipList', () => ({
      remoteIp: req.socket.remoteAddress || req.connection.remoteAddress || '',
      forwarded: ((req.headers[xForwardedFor] as string) || '').split(',').map(s => s.trim()),
    }))

  return {
    rawRequest: req,
    url: req.url,
    method: req.method,
    headers: req.headers,
    rawBody,
    reqId,
    getIp,
    getIpList,
    isCompressed,

    // limits
    getMaxCompressed,
    setMaxCompressed,
    getReadTimeoutMs,
    setReadTimeoutMs,
    getMaxInflated,
    setMaxInflated,
    // getMaxRatio,
    // setMaxRatio,
  }
}
