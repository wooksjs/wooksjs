import type { TConsoleBase } from '@prostojs/logger'
import type { TEventOptions } from '@wooksjs/event-core'
import type { IncomingMessage, Server, ServerResponse } from 'http'
import http from 'http'
import type { ListenOptions } from 'net'
import type { TWooksHandler, TWooksOptions, Wooks } from 'wooks'
import { WooksAdapterBase } from 'wooks'

import { HttpError } from './errors'
import { createHttpContext, useHttpContext } from './event-http'
import { createWooksResponder } from './response'
import type { TRequestLimits } from './types'

/** Configuration options for the WooksHttp adapter. */
export interface TWooksHttpOptions {
  logger?: TConsoleBase
  eventOptions?: TEventOptions
  onNotFound?: TWooksHandler
  router?: TWooksOptions['router']
  /** Default request body limits applied to every request (overridable per-request via `useRequest()`). */
  requestLimits?: Omit<TRequestLimits, 'perRequest'>
}

/** HTTP adapter for Wooks that provides route registration, server lifecycle, and request handling. */
export class WooksHttp extends WooksAdapterBase {
  protected logger: TConsoleBase
  protected _cachedEventOptions: TEventOptions

  constructor(
    protected opts?: TWooksHttpOptions,
    wooks?: Wooks | WooksAdapterBase,
  ) {
    super(wooks, opts?.logger, opts?.router)
    this.logger = opts?.logger || this.getLogger(`${__DYE_CYAN_BRIGHT__}[wooks-http]`)
    this._cachedEventOptions = this.mergeEventOptions(opts?.eventOptions)
  }

  /** Registers a handler for all HTTP methods on the given path. */
  all<ResType = unknown, ParamsType = Record<string, string | string[]>>(
    path: string,
    handler: TWooksHandler<ResType>,
  ) {
    return this.on<ResType, ParamsType>('*', path, handler)
  }

  /** Registers a GET route handler. */
  get<ResType = unknown, ParamsType = Record<string, string | string[]>>(
    path: string,
    handler: TWooksHandler<ResType>,
  ) {
    return this.on<ResType, ParamsType>('GET', path, handler)
  }

  /** Registers a POST route handler. */
  post<ResType = unknown, ParamsType = Record<string, string | string[]>>(
    path: string,
    handler: TWooksHandler<ResType>,
  ) {
    return this.on<ResType, ParamsType>('POST', path, handler)
  }

  /** Registers a PUT route handler. */
  put<ResType = unknown, ParamsType = Record<string, string | string[]>>(
    path: string,
    handler: TWooksHandler<ResType>,
  ) {
    return this.on<ResType, ParamsType>('PUT', path, handler)
  }

  /** Registers a PATCH route handler. */
  patch<ResType = unknown, ParamsType = Record<string, string | string[]>>(
    path: string,
    handler: TWooksHandler<ResType>,
  ) {
    return this.on<ResType, ParamsType>('PATCH', path, handler)
  }

  /** Registers a DELETE route handler. */
  delete<ResType = unknown, ParamsType = Record<string, string | string[]>>(
    path: string,
    handler: TWooksHandler<ResType>,
  ) {
    return this.on<ResType, ParamsType>('DELETE', path, handler)
  }

  /** Registers a HEAD route handler. */
  head<ResType = unknown, ParamsType = Record<string, string | string[]>>(
    path: string,
    handler: TWooksHandler<ResType>,
  ) {
    return this.on<ResType, ParamsType>('HEAD', path, handler)
  }

  /** Registers an OPTIONS route handler. */
  options<ResType = unknown, ParamsType = Record<string, string | string[]>>(
    path: string,
    handler: TWooksHandler<ResType>,
  ) {
    return this.on<ResType, ParamsType>('OPTIONS', path, handler)
  }

  protected server?: Server

  /**
   * Starts the http(s) server.
   *
   * Use this only if you rely on Wooks server.
   */
  public listen(
    port?: number,
    hostname?: string,
    backlog?: number,
    listeningListener?: () => void,
  ): Promise<void>
  public listen(port?: number, hostname?: string, listeningListener?: () => void): Promise<void>
  public listen(port?: number, backlog?: number, listeningListener?: () => void): Promise<void>
  public listen(port?: number, listeningListener?: () => void): Promise<void>
  public listen(path: string, backlog?: number, listeningListener?: () => void): Promise<void>
  public listen(path: string, listeningListener?: () => void): Promise<void>
  public listen(options: ListenOptions, listeningListener?: () => void): Promise<void>
  public listen(handle: unknown, backlog?: number, listeningListener?: () => void): Promise<void>
  public listen(handle: unknown, listeningListener?: () => void): Promise<void>
  public async listen(
    port?: number | string | ListenOptions,
    hostname?: number | string | (() => void),
    backlog?: number | (() => void),
    listeningListener?: () => void,
  ) {
    const server = (this.server = http.createServer(this.getServerCb() as http.RequestListener))
    return new Promise((resolve, reject) => {
      server.once('listening', resolve)
      server.once('error', reject)
      let args = [port as number, hostname as string, backlog as number, listeningListener]
      const ui = args.indexOf(undefined)
      if (ui >= 0) {
        args = args.slice(0, ui)
      }
      server.listen(...(args as [number]))
    })
  }

  /**
   * Stops the server if it was attached or passed via argument
   * @param server
   */
  public close(server?: Server) {
    const srv = server || this.server
    return new Promise((resolve, reject) => {
      srv?.close((err) => {
        if (err) {
          reject(err)
          return
        }
        resolve(srv)
      })
    })
  }

  /**
   * Returns http(s) server that was attached to Wooks
   *
   * See attachServer method docs
   * @returns Server
   */
  getServer() {
    return this.server
  }

  /**
   * Attaches http(s) server instance
   * to Wooks.
   *
   * Use it only if you want to `close` method to stop the server.
   * @param server Server
   */
  attachServer(server?: Server) {
    this.server = server
  }

  protected responder = createWooksResponder()

  protected respond(data: unknown) {
    return this.responder.respond(data)?.catch((error) => {
      this.logger.error('Uncaught response exception', error)
    })
  }

  /**
   * Returns server callback function
   * that can be passed to any node server:
   * ```js
   * import { createHttpApp } from '@wooksjs/event-http'
   * import http from 'http'
   *
   * const app = createHttpApp()
   * const server = http.createServer(app.getServerCb())
   * server.listen(3000)
   * ```
   */
  getServerCb() {
    return (req: IncomingMessage, res: ServerResponse) => {
      const runInContext = createHttpContext(
        { req, res, requestLimits: this.opts?.requestLimits },
        this._cachedEventOptions,
      )
      const method = req.method || ''
      const url = req.url || ''
      runInContext(async () => {
        const notFoundHandler = this.opts?.onNotFound
        const { handlers } = this.wooks.lookup(method, url)
        if (handlers || notFoundHandler) {
          try {
            return await this.processHandlers(handlers || [notFoundHandler as TWooksHandler])
          } catch (error) {
            this.logger.error('Internal error, please report', error)
            await this.respond(error)
            return error
          }
        } else {
          // not found
          this.logger.debug(`404 Not found (${method})${url}`)
          const error = new HttpError(404)
          await this.respond(error)
          return error
        }
      })
    }
  }

  protected async processHandlers(handlers: TWooksHandler[]) {
    const { store } = useHttpContext()
    for (let i = 0; i < handlers.length; i++) {
      const handler = handlers[i]
      const isLastHandler = i === handlers.length - 1
      try {
        const promise = handler() as Promise<unknown>
        const result = await promise
        // even if the returned value is an Error instance
        // we still want to process it as a response
        await this.respond(result)
        return result
      } catch (error) {
        if (error instanceof HttpError) {
          // this.logger.debug(
          //   `${error.body.statusCode}: ${error.message} :: ${store('event').get('req')?.url || ''}`
          // )
        } else {
          this.logger.error(
            `Uncaught route handler exception: ${store('event').get('req')?.url || ''}`,
            error,
          )
        }
        if (isLastHandler) {
          await this.respond(error)
          return error
        }
      }
    }
  }
}

/**
 * Creates a new WooksHttp application instance.
 * @example
 * ```ts
 * const app = createHttpApp()
 * app.get('/hello', () => 'Hello World!')
 * app.listen(3000)
 * ```
 */
export function createHttpApp(opts?: TWooksHttpOptions, wooks?: Wooks | WooksAdapterBase) {
  return new WooksHttp(opts, wooks)
}
