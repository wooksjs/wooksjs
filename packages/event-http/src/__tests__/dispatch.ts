import { IncomingMessage, ServerResponse } from 'http'
import { Duplex } from 'stream'

/** Socket stand-in for in-memory requests: discards writes, never yields data. */
export class NoopSocket extends Duplex {
  _read(): void {}
  _write(_chunk: unknown, _enc: string, cb: () => void): void {
    cb()
  }
}

export interface TDispatched {
  status: number
  body: Buffer
  text: string
}

/**
 * Calls a server callback with an in-memory request. `ended` resolves with the status and the
 * body passed to `res.end()` once the response ends.
 */
export function dispatch(
  cb: (req: IncomingMessage, res: ServerResponse) => void,
  {
    method = 'GET',
    url,
    headers = {},
  }: { method?: string; url: string; headers?: Record<string, string> },
): { res: ServerResponse; ended: Promise<TDispatched> } {
  const req = new IncomingMessage(new NoopSocket() as never)
  req.method = method
  req.url = url
  req.headers = headers
  const res = new ServerResponse(req)
  const ended = new Promise<TDispatched>((resolve) => {
    const end = res.end.bind(res)
    res.end = ((chunk?: unknown, ...rest: unknown[]) => {
      const body =
        chunk && typeof chunk !== 'function' ? Buffer.from(chunk as string) : Buffer.alloc(0)
      resolve({ status: res.statusCode, body, text: body.toString() })
      return end(chunk as never, ...(rest as []))
    }) as typeof res.end
  })
  cb(req, res)
  return { res, ended }
}
