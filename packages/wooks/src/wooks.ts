import type { TConsoleBase, TProstoLoggerOptions } from '@prostojs/logger'
import { coloredConsole, createConsoleTransort, ProstoLogger } from '@prostojs/logger'
import type { THttpMethod, TParsedSegment, TProstoRouterPathHandle } from '@prostojs/router'
import { ProstoRouter } from '@prostojs/router'
import type { TEventOptions } from '@wooksjs/event-core'
import { getContextInjector, useAsyncEventContext } from '@wooksjs/event-core'

import type { TWooksHandler } from './types'

export interface TWooksOptions {
  logger?: TConsoleBase
  router?: {
    ignoreTrailingSlash?: boolean
    ignoreCase?: boolean
    cacheLimit?: number
  }
}

function getDefaultLogger(topic: string) {
  return new ProstoLogger(
    {
      level: 4,
      transports: [
        createConsoleTransort({
          format: coloredConsole,
        }),
      ],
    },
    topic
  )
}

export class Wooks {
  protected router: ProstoRouter<TWooksHandler>

  protected logger: TConsoleBase

  constructor(opts?: TWooksOptions) {
    this.router = new ProstoRouter({
      silent: true,
      ...opts?.router,
    })
    this.logger = opts?.logger || getDefaultLogger(`${__DYE_CYAN_BRIGHT__}[wooks]`)
  }

  public getRouter(): ProstoRouter<TWooksHandler> {
    return this.router
  }

  public getLogger(topic: string): TConsoleBase {
    if (this.logger instanceof ProstoLogger) {
      return this.logger.createTopic(topic)
    }
    return this.logger
  }

  public getLoggerOptions(): TProstoLoggerOptions {
    if (this.logger instanceof ProstoLogger) {
      return this.logger.getOptions()
    }
    return {} as TProstoLoggerOptions
  }

  public lookup(
    method: string,
    path: string
  ): {
    handlers: TWooksHandler[] | null
    segments: TParsedSegment[] | null
    firstStatic: string | null
    path: string | null
  } {
    const found = this.getRouter().lookup(method as THttpMethod, path || '')
    useAsyncEventContext().store('routeParams').value = found?.ctx?.params || {}
    if (found?.route?.handlers.length) {
      getContextInjector().hook(method, 'Handler:routed', found.route.path)
    } else {
      getContextInjector().hook(method, 'Handler:not_found')
    }
    return {
      handlers: found?.route?.handlers || null,
      segments: found?.route?.segments || null,
      firstStatic: found?.route?.firstStatic || null,
      path: found?.route?.path || null,
    }
  }

  public on<ResType = unknown, ParamsType = Record<string, string | string[]>>(
    method: string,
    path: string,
    handler: TWooksHandler<ResType>
  ): TProstoRouterPathHandle<ParamsType> {
    return this.router.on<ParamsType, TWooksHandler>(method as THttpMethod, path, handler)
  }
}

let gWooks: Wooks | undefined

/**
 * Clear global wooks instance
 *
 * (useful for tests or dev-mode)
 */
export function clearGlobalWooks(): void {
  gWooks = undefined
}

/**
 * Creates global wooks singleton instance to share across adapters
 * @param logger
 * @param routerOpts
 * @returns
 */
export function getGlobalWooks(logger?: TConsoleBase, routerOpts?: TWooksOptions['router']): Wooks {
  if (!gWooks) {
    gWooks = new Wooks({
      logger,
      router: routerOpts,
    })
  }
  return gWooks
}

export class WooksAdapterBase {
  protected wooks: Wooks

  constructor(
    wooks?: Wooks | WooksAdapterBase,
    logger?: TConsoleBase,
    routerOpts?: TWooksOptions['router']
  ) {
    if (wooks && wooks instanceof WooksAdapterBase) {
      this.wooks = wooks.getWooks()
    } else if (wooks && wooks instanceof Wooks) {
      this.wooks = wooks
    } else {
      this.wooks = getGlobalWooks(logger, routerOpts)
    }
  }

  public getWooks(): Wooks {
    return this.wooks
  }

  /**
   * Get logger instance for application logs
   * ```js
   * const app = createHttpApp()
   * const logger = app.getLogger('[app-logger]')
   * logger.log('My App log message')
   * ```
   * @param topic topic for logger
   * @returns logger instance
   */
  public getLogger(topic: string): TConsoleBase {
    return this.getWooks().getLogger(topic)
  }

  protected getLoggerOptions(): TProstoLoggerOptions {
    return this.getWooks().getLoggerOptions()
  }

  protected mergeEventOptions(opts?: TEventOptions): TEventOptions {
    return {
      ...opts,
      eventLogger: {
        ...this.getLoggerOptions(),
        ...opts?.eventLogger,
      } as TEventOptions['eventLogger'],
    }
  }

  public on<ResType = unknown, ParamsType = Record<string, string | string[]>>(
    method: string,
    path: string,
    handler: TWooksHandler<ResType>
  ): TProstoRouterPathHandle<ParamsType> {
    return this.wooks.on<ResType, ParamsType>(method as THttpMethod, path, handler)
  }
}
