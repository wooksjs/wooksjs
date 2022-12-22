import { ProstoRouter, THttpMethod } from '@prostojs/router'
import { TWooksHandler } from './types'
import { useEventContext } from '@wooksjs/event-core'

export class Wooks {
    protected router: ProstoRouter<TWooksHandler>

    constructor() {
        this.router = new ProstoRouter({
            silent: true,
        })
    }

    public getRouter() {
        return this.router
    }

    public lookup(method: string, path: string) {
        const found = this.getRouter().lookup(method as THttpMethod, path || '')
        useEventContext().store('routeParams').value = found?.ctx?.params || {}
        return found?.route?.handlers || null
    }

    public on<ResType = unknown, ParamsType = Record<string, string | string[]>>(method: string, path: string, handler: TWooksHandler<ResType>) {
        return this.router.on<ParamsType, TWooksHandler>(method as THttpMethod, path, handler)
    }
}

let gWooks: Wooks

export function getGlobalWooks(): Wooks {
    if (!gWooks) {
        gWooks = new Wooks()
    }
    return gWooks
}

export class WooksAdapterBase {

    protected wooks: Wooks

    constructor(wooks?: Wooks | WooksAdapterBase) {
        if (wooks && wooks instanceof WooksAdapterBase) {
            this.wooks = wooks.getWooks()
        } else if (wooks && wooks instanceof Wooks) {
            this.wooks = wooks
        } else {
            this.wooks = getGlobalWooks()
        }
    }

    public getWooks() {
        return this.wooks
    }

    public on<ResType = unknown, ParamsType = Record<string, string | string[]>>(method: string, path: string, handler: TWooksHandler<ResType>) {
        return this.wooks.on<ResType, ParamsType>(method as THttpMethod, path, handler)
    }
}
