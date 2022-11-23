import { ProstoRouter, THttpMethod, TProstoParamsType, TProstoRouterPathBuilder } from '@prostojs/router'
import { TWooksHandler } from './types'
import { traceError } from 'common/log'
import { TWooksSubscribeAdapter } from './adapter'
import { useEventContext } from '@wooksjs/event-core'

export class Wooks {
    protected router: ProstoRouter<TWooksHandler>


    protected adapters: TWooksSubscribeAdapter[] = []

    constructor() {
        this.router = new ProstoRouter()
    }

    public getRouter() {
        return this.router
    }

    public shortcuts<K extends PropertyKey, T extends { [name in K]: string }>(shortcuts: T) {
        type newType = typeof this & { [name in keyof T]: ((path: string, handler: TWooksHandler) => TProstoRouterPathBuilder) };
        for (const [name, method] of Object.entries(shortcuts)) {
            if (typeof this[name as keyof typeof this] !== 'undefined') {
                traceError('System error: ', new Error(`Could not assign shortcut "${ name }" because it was already assigned.`))
            } else {
                Object.defineProperty(this, name, {
                        value: (path: string, handler: TWooksHandler) => {
                        return this.on(method as THttpMethod, path, handler)
                    },
                })
            }
        }
        return this as newType
    }

    public async subscribe<T extends TWooksSubscribeAdapter>(adapter: T) {
        await adapter.subscribe(({method, url}) => {
            const found = this.getRouter().lookup(method as THttpMethod, url || '')
            useEventContext().store('routeParams').value = found?.ctx?.params || {}
            return found?.route?.handlers || null
        })
    }

    public on<ResType = unknown, ParamsType = TProstoParamsType>(method: string, path: string, handler: TWooksHandler<ResType>) {
        return this.router.on<ParamsType, TWooksHandler>(method as THttpMethod, path, handler)
    }

}
