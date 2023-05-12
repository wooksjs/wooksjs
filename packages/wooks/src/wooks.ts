import { ProstoRouter, THttpMethod } from '@prostojs/router'
import { TWooksHandler } from './types'
import { TEventOptions, useEventContext } from '@wooksjs/event-core'
import {
    ProstoLogger,
    TConsoleBase,
    TProstoLoggerOptions,
} from '@prostojs/logger'
import { getDefaultLogger } from 'common/logger'

export interface TWooksOptions {
    logger?: TConsoleBase
}

export class Wooks {
    protected router: ProstoRouter<TWooksHandler>

    protected logger: TConsoleBase

    constructor(opts?: TWooksOptions) {
        this.router = new ProstoRouter({
            silent: true,
        })
        this.logger = opts?.logger || getDefaultLogger('wooks')
    }

    public getRouter() {
        return this.router
    }

    public getLogger(topic: string) {
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

    public lookup(method: string, path: string) {
        const found = this.getRouter().lookup(method as THttpMethod, path || '')
        useEventContext().store('routeParams').value = found?.ctx?.params || {}
        return found?.route?.handlers || null
    }

    public on<
        ResType = unknown,
        ParamsType = Record<string, string | string[]>
    >(method: string, path: string, handler: TWooksHandler<ResType>) {
        return this.router.on<ParamsType, TWooksHandler>(
            method as THttpMethod,
            path,
            handler
        )
    }
}

let gWooks: Wooks

export function getGlobalWooks(logger?: TConsoleBase): Wooks {
    if (!gWooks) {
        gWooks = new Wooks({
            logger,
        })
    }
    return gWooks
}

export class WooksAdapterBase {
    protected wooks: Wooks

    constructor(wooks?: Wooks | WooksAdapterBase, logger?: TConsoleBase) {
        if (wooks && wooks instanceof WooksAdapterBase) {
            this.wooks = wooks.getWooks()
        } else if (wooks && wooks instanceof Wooks) {
            this.wooks = wooks
        } else {
            this.wooks = getGlobalWooks(logger)
        }
    }

    public getWooks() {
        return this.wooks
    }

    public getLogger(topic: string) {
        return this.getWooks().getLogger(topic)
    }

    protected getLoggerOptions() {
        return this.getWooks().getLoggerOptions()
    }

    protected mergeEventOptions(opts?: TEventOptions): TEventOptions {
        return {
            ...(opts || {}),
            eventLogger: {
                ...this.getLoggerOptions(),
                ...(opts?.eventLogger || {}),
            } as TEventOptions['eventLogger'],
        }
    }

    public on<
        ResType = unknown,
        ParamsType = Record<string, string | string[]>
    >(method: string, path: string, handler: TWooksHandler<ResType>) {
        return this.wooks.on<ResType, ParamsType>(
            method as THttpMethod,
            path,
            handler
        )
    }
}
