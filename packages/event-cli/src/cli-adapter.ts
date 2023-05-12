import { TWooksHandler, Wooks, WooksAdapterBase } from 'wooks'
import { createCliContext } from './event-cli'
import { TConsoleBase } from '@prostojs/logger'
import { TEventOptions } from '@wooksjs/event-core'

export const cliShortcuts = {
    cli: 'CLI',
}

export interface TWooksCliOptions {
    onError?(e: Error): void
    onUnknownParams?(pathParams: string[]): void
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
        const pathParams = firstFlagIndex
            ? argv.slice(0, firstFlagIndex - 1)
            : argv
        const path =
            '/' + pathParams.map((v) => encodeURIComponent(v)).join('/')
        const { restoreCtx, clearCtx } = createCliContext(
            { argv },
            this.mergeEventOptions(this.opts?.eventOptions)
        )
        const handlers = this.wooks.lookup('CLI', path)
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
                        console.error(
                            __DYE_RED__ + response.message + __DYE_RESET__
                        )
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
            this.onUnknownParams(pathParams)
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

    onUnknownParams(pathParams: string[]) {
        if (this.opts?.onUnknownParams) {
            this.opts.onUnknownParams(pathParams)
        } else {
            this.error(
                __DYE_RESET__ +
                    'Unknown command parameters: ' +
                    __DYE_RED__ +
                    pathParams.join(' ')
            )
            process.exit(1)
        }
    }

    error(e: string | Error) {
        if (typeof e === 'string') {
            console.error(__DYE_RED__ + e + __DYE_RESET__)
        } else {
            console.error(__DYE_RED__ + e.message + __DYE_RESET__)
        }
    }
}

export function createCliApp(
    opts?: TWooksCliOptions,
    wooks?: Wooks | WooksAdapterBase
) {
    return new WooksCli(opts, wooks)
}
