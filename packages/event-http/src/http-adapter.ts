import type { TConsoleBase } from '@prostojs/logger'
import type { TEventOptions } from '@wooksjs/event-core'
import type { IncomingMessage, Server, ServerResponse } from 'http'
import http from 'http'
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
  public async listen(...args: Parameters<Server['listen']>) {
    const server = (this.server = http.createServer(this.getServerCb() as http.RequestListener))
    return new Promise((resolve, reject) => {
      server.once('listening', resolve)
      server.once('error', reject)
      server.listen(...args)
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
    return async (req: IncomingMessage, res: ServerResponse) => {
      const { restoreCtx, clearCtx } = createHttpContext(
        { req, res },
        this.mergeEventOptions(this.opts?.eventOptions)
      )
      const { handlers } = this.wooks.lookup(req.method!, req.url!)
      if (handlers || this.opts?.onNotFound) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-non-null-asserted-optional-chain
          await this.processHandlers(handlers || [this.opts?.onNotFound!])
        } catch (error) {
          this.logger.error('Internal error, please report', error)
          restoreCtx()
          this.respond(error)
          clearCtx()
        }
      } else {
        // not found
        this.logger.debug(`404 Not found (${req.method!})${req.url!}`)
        this.respond(new HttpError(404))
        clearCtx()
      }
    }
  }

  protected async processHandlers(handlers: TWooksHandler[]) {
    const { restoreCtx, clearCtx, store } = useHttpContext()
    for (const [i, handler] of handlers.entries()) {
      const isLastHandler = handlers.length === i + 1
      try {
        restoreCtx()
        const promise = handler() as Promise<unknown>
        clearCtx()
        const result = await promise
        // even if the returned value is an Error instance
        // we still want to process it as a response
        restoreCtx()
        this.respond(result)
        clearCtx()
        break
      } catch (error) {
        this.logger.error(
          `Uncought route handler exception: ${store('event').get('req').url || ''}`,
          error
        )
        if (isLastHandler) {
          restoreCtx()
          this.respond(error)
          clearCtx()
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
