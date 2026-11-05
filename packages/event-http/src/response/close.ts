import { run, tryGetCurrent } from '@wooksjs/event-core'
import type { EventContext, Logger } from '@wooksjs/event-core'
import type { IncomingMessage, ServerResponse } from 'http'
import { Socket } from 'net'
import { Readable } from 'stream'

import type { HttpResponse } from './http-response'

/** What {@link HttpResponse.onClose} callbacks learn about how the response ended. */
export interface THttpResponseCloseInfo {
  /**
   * `true` when the whole response was delivered: flushed to the connection, or — for an
   * in-process `fetch()` — handed over (a streamed body: read to its end). `false` when the
   * connection closed (client abort) or the in-process body was cancelled first.
   */
  finished: boolean
  /** The error that ended the response early (e.g. a failing body stream), if any. */
  error?: Error
}

/** Callback of {@link HttpResponse.onClose}. */
export type THttpResponseCloseCallback = (info: THttpResponseCloseInfo) => unknown

/** The close callbacks of one response; fires them once. */
class CloseWatch {
  /** Each callback with the event context it was registered in. */
  private callbacks: Array<[THttpResponseCloseCallback, EventContext | undefined]> = []
  private info?: THttpResponseCloseInfo

  constructor(private readonly logger: Logger) {}

  /** Whether callbacks are waiting for the close. */
  get pending(): boolean {
    return this.callbacks.length > 0
  }

  add(cb: THttpResponseCloseCallback): void {
    const ctx = tryGetCurrent()
    if (this.info) {
      this.call(cb, ctx, this.info)
    } else {
      this.callbacks.push([cb, ctx])
    }
  }

  readonly fire = (info: THttpResponseCloseInfo): void => {
    if (this.info) {
      return
    }
    this.info = info
    const callbacks = this.callbacks
    this.callbacks = []
    for (const [cb, ctx] of callbacks) {
      this.call(cb, ctx, info)
    }
  }

  private call(
    cb: THttpResponseCloseCallback,
    ctx: EventContext | undefined,
    info: THttpResponseCloseInfo,
  ): void {
    const logFailure = (error: unknown) => {
      ;(ctx?.logger ?? this.logger).error('Response onClose callback failed', error)
    }
    try {
      Promise.resolve(ctx ? run(ctx, () => cb(info)) : cb(info)).catch(logFailure)
    } catch (error) {
      logFailure(error)
    }
  }
}

const watches = new WeakMap<object, CloseWatch>()

/**
 * The close watch of `response`, created on its first `onClose()`. A response on a connection
 * fires on the response's 'close' (sent or aborted). An in-process `fetch()` response (capture
 * mode, no network socket) fires through {@link settleInProcessClose} — or at once when its
 * dispatch is already over.
 */
export function closeWatchOf(
  response: object,
  res: ServerResponse,
  req: IncomingMessage,
  logger: Logger,
  captureMode: boolean,
): CloseWatch {
  let watch = watches.get(response)
  if (!watch) {
    watch = new CloseWatch(logger)
    watches.set(response, watch)
    if (!captureMode || req.socket instanceof Socket) {
      watchConnection(res, req, watch.fire)
    } else if (res.destroyed) {
      // registered after the in-process dispatch handed the response over
      watch.fire({ finished: true })
    }
  }
  return watch
}

/**
 * Settles the close of an in-process `fetch()` response about to be handed to the caller: a
 * streamed body (a `Readable` or a fetch `Response`) is tracked until the caller reads it to
 * its end or cancels it (only when callbacks wait — an untracked body stays the original
 * stream); anything else is over now.
 */
export function settleInProcessClose(response: HttpResponse, webResponse: Response): Response {
  const watch = watches.get(response)
  if (!watch) {
    return webResponse
  }
  if (watch.pending && webResponse.body && isStreamBody(response.body)) {
    return new Response(trackWebBody(webResponse.body, watch.fire), webResponse)
  }
  watch.fire({ finished: true })
  return webResponse
}

function isStreamBody(body: unknown): boolean {
  return (
    body instanceof Readable ||
    (typeof globalThis.Response === 'function' && body instanceof globalThis.Response)
  )
}

/** An in-process `fetch()` failed before handing a response over. */
export function failInProcessClose(response: object, error: unknown): void {
  watches.get(response)?.fire({ finished: false, error: error as Error })
}

/**
 * Close of the streamed body of an in-process response: the body is read to its end
 * (`finished`), cancelled, or fails.
 */
function trackWebBody(
  body: ReadableStream<Uint8Array>,
  fire: (info: THttpResponseCloseInfo) => void,
): ReadableStream<Uint8Array> {
  const reader = body.getReader()
  return new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        try {
          const { done, value } = await reader.read()
          if (done) {
            controller.close()
            fire({ finished: true })
          } else {
            controller.enqueue(value)
          }
        } catch (error) {
          controller.error(error)
          fire({ finished: false, error: error as Error })
        }
      },
      cancel(reason) {
        fire({ finished: false })
        return reader.cancel(reason)
      },
    },
    { highWaterMark: 0 },
  )
}

/**
 * Releases of queued (pipelined) responses per connection: one socket 'close' listener per
 * connection, however many responses are queued on it.
 */
const queuedCloses = new WeakMap<Socket, Set<(info: THttpResponseCloseInfo) => void>>()

function releaseQueued(this: Socket): void {
  const releases = queuedCloses.get(this)
  queuedCloses.delete(this)
  releases?.forEach((fire) => fire({ finished: false }))
}

function queueOn(connection: Socket): Set<(info: THttpResponseCloseInfo) => void> {
  const releases = new Set<(info: THttpResponseCloseInfo) => void>()
  queuedCloses.set(connection, releases)
  connection.once('close', releaseQueued)
  return releases
}

function closeInfo(res: ServerResponse): THttpResponseCloseInfo {
  const error = res.errored
  // destroyed with an error after its last byte was flushed still did not end cleanly
  return error ? { finished: false, error } : { finished: res.writableFinished }
}

function watchConnection(
  res: ServerResponse,
  req: IncomingMessage,
  fire: (info: THttpResponseCloseInfo) => void,
): void {
  if (res.closed) {
    fire(closeInfo(res))
    return
  }
  const connection = req.socket
  if (res.socket || !(connection instanceof Socket)) {
    // 'close' fires once per response — sent or aborted
    res.once('close', () => fire(closeInfo(res)))
    return
  }
  // A pipelined HTTP/1.1 request: its response gets the socket only once the responses ahead
  // of it are done — and never emits 'close' if the client disconnects before that.
  if (connection.destroyed) {
    fire({ finished: false })
    return
  }
  const releases = queuedCloses.get(connection) ?? queueOn(connection)
  releases.add(fire)
  res.once('close', () => {
    releases.delete(fire)
    fire(closeInfo(res))
  })
}
