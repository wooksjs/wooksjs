import type { TConsoleBase, TProstoLoggerOptions } from '@prostojs/logger'
import { coloredConsole, createConsoleTransort, ProstoLogger } from '@prostojs/logger'
import type {
  THttpMethod,
  TParsedSegment,
  TProstoLookupResult,
  TProstoRouterPathHandle,
} from '@prostojs/router'
import { ProstoRouter } from '@prostojs/router'
import { current, getContextInjector, routeParamsKey } from '@wooksjs/event-core'
import type { EventContext, EventContextOptions, Logger } from '@wooksjs/event-core'

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

/** A matched route (from `Wooks.matchRoute()`): the route with its handlers plus the parsed route params. */
export type TWooksRouteMatch = TProstoLookupResult<TWooksHandler>

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
   * Matches a route by method and path without touching any event context:
   * no route params are seeded and no `ContextInjector` hooks fire.
   *
   * Use it to decide whether a request is handled here before creating an event
   * context, then call `applyRoute()` inside the context with the returned match.
   * @param method - HTTP method (e.g., "GET", "POST").
   * @param path - URL path to match against registered routes.
   * @returns The route match, or `null` when no route with handlers matches.
   */
  public matchRoute(method: string, path: string): TWooksRouteMatch | null {
    const found = this.getRouter().lookup(method as THttpMethod, path || '')
    return found && found.route.handlers.length ? found : null
  }

  /**
   * Applies a route match (from `matchRoute()`) to an event context: seeds route params
   * (`useRouteParams()`) and fires the `Handler:routed` / `Handler:not_found` hook.
   * @param method - HTTP method the match was made for.
   * @param match - Result of `matchRoute()` (`null` = not found).
   * @param ctx - Event context to seed (defaults to the current one).
   * @returns The matched route's handlers, or `null` when `match` is `null`.
   */
  public applyRoute(method: string, match: TWooksRouteMatch, ctx?: EventContext): TWooksHandler[]
  public applyRoute(
    method: string,
    match: TWooksRouteMatch | null,
    ctx?: EventContext,
  ): TWooksHandler[] | null
  public applyRoute(
    method: string,
    match: TWooksRouteMatch | null,
    ctx: EventContext = current(),
  ): TWooksHandler[] | null {
    const ci = getContextInjector()
    if (match) {
      ctx.set(routeParamsKey, match.ctx.params || {})
      ci?.hook(method, 'Handler:routed', match.route.path)
      return match.route.handlers
    }
    ctx.set(routeParamsKey, {})
    ci?.hook(method, 'Handler:not_found')
    return null
  }

  /**
   * Looks up a route by method and path, setting route params in the current event context.
   * @param method - HTTP method (e.g., "GET", "POST").
   * @param path - URL path to match against registered routes.
   */
  public lookup(
    method: string,
    path: string,
    ctx: EventContext = current(),
  ): {
    handlers: TWooksHandler[] | null
    segments: TParsedSegment[] | null
    firstStatic: string | null
    path: string | null
  } {
    const match = this.matchRoute(method, path)
    return {
      handlers: this.applyRoute(method, match, ctx),
      segments: match?.route.segments || null,
      firstStatic: match?.route.firstStatic || null,
      path: match?.route.path || null,
    }
  }

  /**
   * Fast lookup that returns only the handlers array (or null).
   * Avoids allocating a result object on each request.
   * Equivalent to `applyRoute(method, matchRoute(method, path), ctx)`.
   */
  public lookupHandlers(
    method: string,
    path: string,
    ctx: EventContext = current(),
  ): TWooksHandler[] | null {
    return this.applyRoute(method, this.matchRoute(method, path), ctx)
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

  /** Returns event context options with a logger derived from the Wooks instance. */
  protected getEventContextOptions(): EventContextOptions {
    return { logger: this.getWooks().getLogger('event') as Logger }
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
