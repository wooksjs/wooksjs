import { TWooksSubscribeAdapter, TWooksHandler, TWooksLookupArgs, TWooksLookupHandlers } from 'wooks'
import { IncomingMessage, Server, ServerResponse } from 'http'
import { createServer } from './http'
import { createHttpContext, useHttpContext } from './event-http'
import { createWooksResponder } from './response'
import { WooksError } from './errors'
import { traceError } from 'common/log'

export const httpShortcuts = {
    all: '*',
    get: 'GET',
    post: 'POST',
    put: 'PUT',
    patch: 'PATCH',
    delete: 'DELETE',
    head: 'HEAD',
    options: 'OPTIONS',
}

export class WooksHttp implements TWooksSubscribeAdapter {
    constructor(protected port: number, protected hostname?: string | (() => void) , protected cb?: () => void) {

    }

    protected server?: Server

    protected responder = createWooksResponder()

    protected respond(data: unknown) {
        void this.responder.respond(data)?.catch((e) => {
            traceError('Uncought response exception:\n', e as Error)
        })
    }

    subscribe(lookup: (route: TWooksLookupArgs) => TWooksLookupHandlers | null): void | Promise<void> {
        const port = this.port
        const hostname = this.hostname
        const cb = this.cb
        return new Promise((resolve, reject) => {
            const listenCb = () => {
                const fn = typeof hostname === 'function' ? hostname : cb
                if (fn) { fn() }
                this.server?.off('error', reject)
                resolve()
            }
            try {
                this.server = createServer({ port },
                    (req, res) => {
                        this.processRequest(req, res, lookup)
                    },
                    typeof hostname === 'string' ? hostname : '',
                    listenCb,
                )
                this.server?.on('error', reject)
            } catch(e) {
                reject(e)
            }
        })
    }

    protected async processRequest(req: IncomingMessage, res: ServerResponse, lookup: (route: TWooksLookupArgs) => TWooksLookupHandlers | null) {
        const { restoreCtx, clearCtx } = createHttpContext({ req, res })
        const handlers = lookup({ method: req.method, url: req.url })
        if (handlers) {
            try {
                await this.processHandlers(handlers)
            } catch (e) {
                traceError('Internal error, please report: ', e as Error)
                restoreCtx()
                this.respond(e)
                clearCtx()
            }
        } else {
            // not found
            this.respond(new WooksError(404))
            clearCtx()
        }    
    }
    
    protected async processHandlers(handlers: TWooksHandler<unknown>[]) {
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
            } catch (e) {
                traceError('Uncought route handler exception: ' + (store('event').get('req') || '') + '\n', e as Error)
                if (isLastHandler) {
                    restoreCtx()
                    this.respond(e)
                    clearCtx()
                }
            }
        }
    }

    public close() {
        return new Promise((resolve, reject) => {
            this.server?.close((err) => {
                if (err) return reject(err)
                resolve(this.server)
            })
        })
    }
}

