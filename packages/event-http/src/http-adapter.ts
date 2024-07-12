/* eslint-disable @typescript-eslint/no-confusing-void-expression */
/* eslint-disable @typescript-eslint/unified-signatures */
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

export interface TWooksHttpOptions {
  logger?: TConsoleBase
  eventOptions?: TEventOptions
  onNotFound?: TWooksHandler
  router?: TWooksOptions['router']
}

export class WooksHttp extends WooksAdapterBase {
  protected logger: TConsoleBase

  constructor(
    protected opts?: TWooksHttpOptions,
    wooks?: Wooks | WooksAdapterBase
  ) {
    super(wooks, opts?.logger, opts?.router)
    this.logger = opts?.logger || this.getLogger('wooks-http')
  }

  all<ResType = unknown, ParamsType = Record<string, string | string[]>>(
    path: string,
    handler: TWooksHandler<ResType>
  ) {
    return this.on<ResType, ParamsType>('*', path, handler)
  }

  get<ResType = unknown, ParamsType = Record<string, string | string[]>>(
    path: string,
    handler: TWooksHandler<ResType>
  ) {
    return this.on<ResType, ParamsType>('GET', path, handler)
  }

  post<ResType = unknown, ParamsType = Record<string, string | string[]>>(
    path: string,
    handler: TWooksHandler<ResType>
  ) {
    return this.on<ResType, ParamsType>('POST', path, handler)
  }

  put<ResType = unknown, ParamsType = Record<string, string | string[]>>(
    path: string,
    handler: TWooksHandler<ResType>
  ) {
    return this.on<ResType, ParamsType>('PUT', path, handler)
  }

  patch<ResType = unknown, ParamsType = Record<string, string | string[]>>(
    path: string,
    handler: TWooksHandler<ResType>
  ) {
    return this.on<ResType, ParamsType>('PATCH', path, handler)
  }

  delete<ResType = unknown, ParamsType = Record<string, string | string[]>>(
    path: string,
    handler: TWooksHandler<ResType>
  ) {
    return this.on<ResType, ParamsType>('DELETE', path, handler)
  }

  head<ResType = unknown, ParamsType = Record<string, string | string[]>>(
    path: string,
    handler: TWooksHandler<ResType>
  ) {
    return this.on<ResType, ParamsType>('HEAD', path, handler)
  }

  options<ResType = unknown, ParamsType = Record<string, string | string[]>>(
    path: string,
    handler: TWooksHandler<ResType>
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
    listeningListener?: () => void
  ): Promise<void>
  public listen(port?: number, hostname?: string, listeningListener?: () => void): Promise<void>
  public listen(port?: number, backlog?: number, listeningListener?: () => void): Promise<void>
  public listen(port?: number, listeningListener?: () => void): Promise<void>
  public listen(path: string, backlog?: number, listeningListener?: () => void): Promise<void>
  public listen(path: string, listeningListener?: () => void): Promise<void>
  public listen(options: ListenOptions, listeningListener?: () => void): Promise<void>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public listen(handle: any, backlog?: number, listeningListener?: () => void): Promise<void>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public listen(handle: any, listeningListener?: () => void): Promise<void>
  public async listen(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    port?: number | string | ListenOptions | any,
    hostname?: number | string | (() => void),
    backlog?: number | (() => void),
    listeningListener?: () => void
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
      srv?.close(err => {
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
    void this.responder.respond(data)?.catch(e => {
      this.logger.error('Uncought response exception', e)
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
        { req, res },
        this.mergeEventOptions(this.opts?.eventOptions)
      )
      runInContext(async () => {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const { handlers } = this.wooks.lookup(req.method!, req.url!)
        if (handlers || this.opts?.onNotFound) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-non-null-asserted-optional-chain, @typescript-eslint/no-non-null-assertion
            return await this.processHandlers(handlers || [this.opts?.onNotFound!])
          } catch (error) {
            this.logger.error('Internal error, please report', error)
            this.respond(error)
            return error
          }
        } else {
          // not found
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          this.logger.debug(`404 Not found (${req.method!})${req.url!}`)
          const error = new HttpError(404)
          this.respond(error)
          return error
        }
      })
    }
  }

  protected async processHandlers(handlers: TWooksHandler[]) {
    const { store } = useHttpContext()
    for (const [i, handler] of handlers.entries()) {
      const isLastHandler = handlers.length === i + 1
      try {
        const promise = handler() as Promise<unknown>
        const result = await promise
        // even if the returned value is an Error instance
        // we still want to process it as a response
        this.respond(result)
        return result
      } catch (error) {
        if (error instanceof HttpError) {
          // this.logger.debug(
          //   `${error.body.statusCode}: ${error.message} :: ${store('event').get('req')?.url || ''}`
          // )
        } else {
          this.logger.error(
            `Uncought route handler exception: ${store('event').get('req')?.url || ''}`,
            error
          )
        }
        if (isLastHandler) {
          this.respond(error)
          return error
        }
      }
    }
  }
}

/**
 * Factory for WooksHttp App
 * @param opts TWooksHttpOptions
 * @param wooks Wooks | WooksAdapterBase
 * @returns WooksHttp
 */
export function createHttpApp(opts?: TWooksHttpOptions, wooks?: Wooks | WooksAdapterBase) {
  return new WooksHttp(opts, wooks)
}
