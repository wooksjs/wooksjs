/*
 * Raw-socket HTTP helpers for specs of several packages (event-http, http-static) — kept at the
 * repo root so no package's tests import another package's sources.
 */
import type { Server } from 'http'
import net from 'net'

/** Starts `app` on a free local port; returns the port. */
export async function listenLocal(app: {
  listen(port: number, host: string): Promise<unknown>
  getServer(): Server | undefined
}): Promise<number> {
  await app.listen(0, '127.0.0.1')
  const server = app.getServer()
  if (!server) {
    throw new Error('listenLocal: the app has no server after listen()')
  }
  return (server.address() as { port: number }).port
}

/** A response read off the wire, byte for byte (no client-side header joining). */
export interface TRawResponse {
  status: number
  /** every header line in order, names as sent */
  headers: Array<[string, string]>
  /** the body bytes as delivered (chunked transfer decoded) */
  body: Buffer
}

/**
 * Sends one HTTP/1.1 request over a raw socket (`Connection: close`) and parses the response
 * exactly as sent — duplicate header lines stay duplicates.
 */
export function rawRequest(
  port: number,
  method: string,
  path: string,
  headers: Record<string, string> = {},
): Promise<TRawResponse> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1', () => {
      const lines = [`${method} ${path} HTTP/1.1`, 'Host: test', 'Connection: close']
      for (const [k, v] of Object.entries(headers)) {
        lines.push(`${k}: ${v}`)
      }
      socket.write(`${lines.join('\r\n')}\r\n\r\n`)
    })
    const chunks: Buffer[] = []
    socket.on('data', (c: Buffer) => chunks.push(c))
    socket.on('error', reject)
    socket.on('end', () => {
      const raw = Buffer.concat(chunks)
      const split = raw.indexOf('\r\n\r\n')
      const head = raw.subarray(0, split).toString('latin1').split('\r\n')
      const status = Number(head[0].split(' ')[1])
      const parsed: Array<[string, string]> = head.slice(1).map((line) => {
        const i = line.indexOf(':')
        return [line.slice(0, i), line.slice(i + 1).trim()]
      })
      let body: Buffer = raw.subarray(split + 4)
      const te = parsed.find(([k]) => k.toLowerCase() === 'transfer-encoding')
      if (te && /chunked/iu.test(te[1]) && method !== 'HEAD') {
        body = decodeChunked(body)
      }
      resolve({ status, headers: parsed, body })
    })
  })
}

function decodeChunked(buf: Buffer): Buffer {
  const out: Buffer[] = []
  let p = 0
  for (;;) {
    const eol = buf.indexOf('\r\n', p)
    const size = Number.parseInt(buf.subarray(p, eol).toString('latin1'), 16)
    if (!size) {
      break
    }
    out.push(buf.subarray(eol + 2, eol + 2 + size))
    p = eol + 2 + size + 2
  }
  return Buffer.concat(out)
}

/** All values of header `name` (case-insensitive). */
export function headerValues(res: TRawResponse, name: string): string[] {
  const lower = name.toLowerCase()
  return res.headers.filter(([k]) => k.toLowerCase() === lower).map(([, v]) => v)
}
