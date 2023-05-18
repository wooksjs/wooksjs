import { TWooksHandler, Wooks, WooksAdapterBase } from 'wooks'
import { createCliContext } from './event-cli'
import { TConsoleBase } from '@prostojs/logger'
import { TEventOptions } from '@wooksjs/event-core'

export const cliShortcuts = {
    cli: 'CLI',
}

export interface TWooksCliOptions {
    onError?(e: Error): void
    onNotFound?: TWooksHandler<unknown>
    onUnknownCommand?: ((params: string[]) => unknown)
    logger?: TConsoleBase
    eventOptions?: TEventOptions
}

export class WooksCli extends WooksAdapterBase {
    protected logger: TConsoleBase

    constructor(
        protected opts?: TWooksCliOptions,
        wooks?: Wooks | WooksAdapterBase
    ) {
        super(wooks, opts?.logger)
        this.logger = opts?.logger || this.getLogger('wooks-cli')
    }

    cli<ResType = unknown, ParamsType = Record<string, string | string[]>>(
        path: string,
        handler: TWooksHandler<ResType>
    ) {
        return this.on<ResType, ParamsType>('CLI', path, handler)
    }

    async run(_argv?: string[]) {
        const argv = process.argv.slice(2) || _argv
        const firstFlagIndex = argv.findIndex((a) => a.startsWith('-')) + 1
        const pathParams = (firstFlagIndex
            ? argv.slice(0, firstFlagIndex - 1)
            : argv)
        const path =
            '/' + pathParams.map((v) => encodeURI(v).replace(/\//g, '%2F')).join('/')
        const { restoreCtx, clearCtx } = createCliContext(
            { argv, pathParams },
            this.mergeEventOptions(this.opts?.eventOptions)
        )
        const handlers = this.wooks.lookup('CLI', path) || this.opts?.onNotFound && [this.opts.onNotFound] || null
        if (handlers) {
            try {
                for (const handler of handlers) {
                    restoreCtx()
                    const response = await handler()
                    if (typeof response === 'string') {
                        console.log(response)
                    } else if (Array.isArray(response)) {
                        response.forEach((r) =>
                            console.log(
                                typeof r === 'string'
                                    ? r
                                    : JSON.stringify(r, null, '  ')
                            )
                        )
                    } else if (response instanceof Error) {
                        this.onError(response)
                    } else if (response) {
                        if (response) {
                            console.log(JSON.stringify(response, null, '  '))
                        }
                    }
                }
            } catch (e) {
                this.onError(e as Error)
            }
            clearCtx()
        } else {
            this.onUnknownCommand(pathParams)
            clearCtx()
        }
    }

    onError(e: Error) {
        if (this.opts?.onError) {
            this.opts.onError(e)
        } else {
            this.error(e.message)
            process.exit(1)
        }
    }

    onUnknownCommand(pathParams: string[]) {
        if (this.opts?.onUnknownCommand) {
            this.opts.onUnknownCommand(pathParams)
        } else {
            this.error(
                __DYE_RESET__ +
                'Unknown command: ' +
                pathParams.join(' ')
            )
            process.exit(1)
        }
    }

    error(e: string | Error) {
        if (typeof e === 'string') {
            console.error(__DYE_RED__ + 'ERROR: ' + __DYE_RESET__ + e)
        } else {
            console.error(__DYE_RED__ + 'ERROR: ' + __DYE_RESET__ + e.message)
        }
    }
}

export function createCliApp(
    opts?: TWooksCliOptions,
    wooks?: Wooks | WooksAdapterBase
) {
    return new WooksCli(opts, wooks)
}
