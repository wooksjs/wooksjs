import { ProstoRouter, THttpMethod, TProstoLookupResult, TProstoParamsType } from '@prostojs/router'
import { IncomingMessage, Server, ServerResponse } from 'http'
import { createWooksCtx, useWooksCtx, WooksError, createWooksResponder } from '@wooksjs/composables'
import { createServer } from './http'
import { TWooksHandler, TWooksOptions } from './types'
import { banner } from 'common/banner'
import { panic } from 'common/panic'

export class Wooks {
    protected router: ProstoRouter<TWooksHandler>
    
    protected server?: Server

    protected responder = createWooksResponder()

    protected _uncoughtExceptionHandler: (error: Error) => void

    constructor(private options?: TWooksOptions) {
        this.router = new ProstoRouter()
        if (!true) {
            console.log(this.options)
        }
        this._uncoughtExceptionHandler = ((err: Error) => {
            this.printError('Uncought exception: ', err)
        }).bind(this)
    }

    public getRouter() {
        return this.router
    }

    public listen(port: number): Promise<void>

    public listen(port: number, cb: () => void): Promise<void>

    public listen(port: number, hostname: string): Promise<void>

    public listen(port: number, hostname: string, cb: () => void): Promise<void>

    public listen(port: number, hostname?: string | (() => void) , cb?: () => void): Promise<void> {
        return new Promise((resolve, reject) => {
            const myCb = () => {
                const fn = typeof hostname === 'function' ? hostname : cb
                process.on('uncaughtException', this._uncoughtExceptionHandler)
                if (fn) { fn() }
                this.server?.off('error', reject)
                resolve()
            }
            try {
                this.server = createServer(
                    {
                        port,
                    },
                    this.processRequest.bind(this),
                    typeof hostname === 'string' ? hostname : '',
                    myCb,
                )
                this.server?.on('error', reject)
            } catch(e) {
                reject(e)
            }
        })
    }

    public close() {
        return new Promise((resolve, reject) => {
            this.server?.close((err) => {
                if (err) return reject(err)
                process.off('uncaughtException', this._uncoughtExceptionHandler)
                resolve(this.server)
            })
        })
    }

    protected processRequest(req: IncomingMessage, res: ServerResponse) {
        const found = this.router.lookup(req.method as THttpMethod, req.url as string)
        const params = found?.ctx?.params || {}
        const { restoreCtx, clearCtx } = createWooksCtx({ req, res, params })
        if (found) {
            this.processHandlers(req, res, found)
                // .then(() => {
                //     console.log('ok')
                // })
                .catch((e) => {
                    this.printError('Internal error, please report: ', e as Error)
                    restoreCtx()
                    this.respond(e)
                    clearCtx()
                    console.error(__DYE_RED_BRIGHT__ + __DYE_BOLD__ + banner(), e, __DYE_RESET__)
                })
                // .finally(() => {
                //     console.log('done')
                // })
        } else {
            // not found
            this.respond(new WooksError(404))
            clearCtx()
        }
    }

    protected async processHandlers(req: IncomingMessage, res: ServerResponse, found: TProstoLookupResult<TWooksHandler>) {
        const { restoreCtx, clearCtx } = useWooksCtx()
        for (const [i, handler] of found.route.handlers.entries()) {
            const isLastHandler = found.route.handlers.length === i + 1
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
            } catch (e) {
                this.printError('Uncought route handler exception: ' + (req.url || '') + '\n', e as Error)
                if (isLastHandler) {
                    restoreCtx()
                    this.respond(e)
                    clearCtx()
                }
            }
        }
    }

    protected printError(expl: string, e: Error) {
        if (!(e instanceof WooksError)) {
            panic(expl + e.message)
            console.error(__DYE_RED__ + (e.stack || '') + __DYE_COLOR_OFF__)
        }
    }

    protected respond(data: unknown) {
        void this.responder.respond(data)?.catch((e) => {
            this.printError('Uncought response exception:\n', e as Error)
        })
    }

    get<ResType = unknown, ParamsType = TProstoParamsType>(path: string, handler: TWooksHandler<ResType>) {
        this.router.on<ParamsType, TWooksHandler>('HEAD', path, handler)
        return this.router.on<ParamsType, TWooksHandler>('GET', path, handler)
    }

    post<ResType = unknown, ParamsType = TProstoParamsType>(path: string, handler: TWooksHandler<ResType>) {
        return this.router.on<ParamsType, TWooksHandler>('POST', path, handler)
    }

    put<ResType = unknown, ParamsType = TProstoParamsType>(path: string, handler: TWooksHandler<ResType>) {
        return this.router.on<ParamsType, TWooksHandler>('PUT', path, handler)
    }

    delete<ResType = unknown, ParamsType = TProstoParamsType>(path: string, handler: TWooksHandler<ResType>) {
        return this.router.on<ParamsType, TWooksHandler>('DELETE', path, handler)
    }

    patch<ResType = unknown, ParamsType = TProstoParamsType>(path: string, handler: TWooksHandler<ResType>) {
        return this.router.on<ParamsType, TWooksHandler>('PATCH', path, handler)
    }

    on<ResType = unknown, ParamsType = TProstoParamsType>(method: THttpMethod | '*', path: string, handler: TWooksHandler<ResType>) {
        return this.router.on<ParamsType, TWooksHandler>(method, path, handler)
    }
}
