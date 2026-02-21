import type { TConsoleBase, TProstoLoggerOptions } from '@prostojs/logger'
import { coloredConsole, createConsoleTransort, ProstoLogger } from '@prostojs/logger'
import type { THttpMethod, TParsedSegment, TProstoRouterPathHandle } from '@prostojs/router'
import { ProstoRouter } from '@prostojs/router'
import type { TEventOptions } from '@wooksjs/event-core'
import { getContextInjector, useAsyncEventContext } from '@wooksjs/event-core'

import type { TWooksHandler } from './types'

/** Configuration options for the Wooks instance. */
export interface TWooksOptions {
  /** Custom logger instance to use instead of the default. */
  logger?: TConsoleBase
  /** Router configuration options. */
  router?: {
    /** When true, `/path` and `/path/` are treated as the same route. */
    ignoreTrailingSlash?: boolean
    /** When true, route matching is case-insensitive. */
    ignoreCase?: boolean
    /** Maximum number of parsed routes to cache. */
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
    topic,
  )
}

/**
 * Core Wooks framework class that manages routing and logging.
 *
 * @example
 * ```ts
 * const wooks = new Wooks({ router: { ignoreTrailingSlash: true } })
 * wooks.on('GET', '/hello', () => 'Hello World')
 * ```
 */
export class Wooks {
  protected router: ProstoRouter<TWooksHandler>

  protected logger: TConsoleBase

  /** @param opts - Optional configuration for router and logger. */
  constructor(opts?: TWooksOptions) {
    this.router = new ProstoRouter({
      silent: true,
      ...opts?.router,
    })
    this.logger = opts?.logger || getDefaultLogger(`${__DYE_CYAN_BRIGHT__}[wooks]`)
  }

  /** Returns the underlying ProstoRouter instance. */
  public getRouter(): ProstoRouter<TWooksHandler> {
    return this.router
  }

  /**
   * Creates a child logger with the given topic.
   * @param topic - Label for the logger topic.
   */
  public getLogger(topic: string): TConsoleBase {
    if (this.logger instanceof ProstoLogger) {
      return this.logger.createTopic(topic)
    }
    return this.logger
  }

  /** Returns the current logger configuration options. */
  public getLoggerOptions(): TProstoLoggerOptions {
    if (this.logger instanceof ProstoLogger) {
      return this.logger.getOptions()
    }
    return {} as TProstoLoggerOptions
  }

  /**
   * Looks up a route by method and path, setting route params in the current event context.
   * @param method - HTTP method (e.g., "GET", "POST").
   * @param path - URL path to match against registered routes.
   */
  public lookup(
    method: string,
    path: string,
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

  /**
   * Registers a route handler for the given method and path.
   * @param method - HTTP method (e.g., "GET", "POST").
   * @param path - URL path pattern (supports parameters like `/users/:id`).
   * @param handler - Handler function invoked when the route matches.
   */
  public on<ResType = unknown, ParamsType = Record<string, string | string[]>>(
    method: string,
    path: string,
    handler: TWooksHandler<ResType>,
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
 * Returns the global Wooks singleton, creating it on first call.
 * @param logger - Optional custom logger for the instance.
 * @param routerOpts - Optional router configuration.
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

/**
 * Base class for Wooks adapters that bridges a specific runtime (e.g., HTTP, CLI) with Wooks routing.
 *
 * @example
 * ```ts
 * class MyAdapter extends WooksAdapterBase {
 *   constructor(wooks?: Wooks) {
 *     super(wooks)
 *   }
 * }
 * ```
 */
export class WooksAdapterBase {
  protected wooks: Wooks

  /**
   * @param wooks - Existing Wooks or adapter instance to share; creates/uses global instance if omitted.
   * @param logger - Custom logger for the global Wooks instance (ignored when `wooks` is provided).
   * @param routerOpts - Router options for the global Wooks instance (ignored when `wooks` is provided).
   */
  constructor(
    wooks?: Wooks | WooksAdapterBase,
    logger?: TConsoleBase,
    routerOpts?: TWooksOptions['router'],
  ) {
    if (wooks && wooks instanceof WooksAdapterBase) {
      this.wooks = wooks.getWooks()
    } else if (wooks && wooks instanceof Wooks) {
      this.wooks = wooks
    } else {
      this.wooks = getGlobalWooks(logger, routerOpts)
    }
  }

  /** Returns the underlying Wooks instance. */
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

  /** Merges the given event options with the current logger configuration. */
  protected mergeEventOptions(opts?: TEventOptions): TEventOptions {
    return {
      ...opts,
      eventLogger: {
        ...this.getLoggerOptions(),
        ...opts?.eventLogger,
      } as TEventOptions['eventLogger'],
    }
  }

  /**
   * Registers a route handler for the given method and path.
   * @param method - HTTP method (e.g., "GET", "POST").
   * @param path - URL path pattern (supports parameters like `/users/:id`).
   * @param handler - Handler function invoked when the route matches.
   */
  public on<ResType = unknown, ParamsType = Record<string, string | string[]>>(
    method: string,
    path: string,
    handler: TWooksHandler<ResType>,
  ): TProstoRouterPathHandle<ParamsType> {
    return this.wooks.on<ResType, ParamsType>(method as THttpMethod, path, handler)
  }
}
