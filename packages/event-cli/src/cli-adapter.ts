import { TWooksHandler, Wooks, WooksAdapterBase } from 'wooks'
import { logError } from 'common/log'
import { createCliContext } from './event-cli'

export const cliShortcuts = {
    cli: 'CLI',
}

export interface TWooksCliOptions {}

export class WooksCli extends WooksAdapterBase {
    constructor(protected opts?: TWooksCliOptions, wooks?: Wooks | WooksAdapterBase) {
        super(wooks)
    }

    cli<ResType = unknown, ParamsType = Record<string, string | string[]>>(path: string, handler: TWooksHandler<ResType>) {
        return this.on<ResType, ParamsType>('CLI', path, handler)
    }

    async run(_argv?: string[]) {
        const argv = process.argv.slice(2) || _argv
        const firstFlagIndex = argv.findIndex(a => a.startsWith('-')) + 1
        const path = '/' + (firstFlagIndex ? argv.slice(0, firstFlagIndex - 1) : argv).map(v => encodeURIComponent(v)).join('/')
        const { restoreCtx, clearCtx } = createCliContext({ argv })
        const handlers = this.wooks.lookup('CLI', path)
        if (handlers) {
            try {
                for (const handler of handlers) {
                    restoreCtx()
                    const response = await handler()
                    if (typeof response === 'string') {
                        console.log(response)
                    } else if (Array.isArray(response)) {
                        response.forEach(r => console.log(typeof r === 'string' ? r : JSON.stringify(r, null, '  ')))
                    } else {
                        console.log(JSON.stringify(response, null, '  '))
                    }
                }
            } catch (e) {
                logError((e as Error).message)
                process.exit(1)
            }
            clearCtx()
        } else {
            logError('Unknown command parameters')
            process.exit(1)
        }   
    }
}

export function createCliApp(opts?: TWooksCliOptions, wooks?: Wooks | WooksAdapterBase) {
    return new WooksCli(opts, wooks)
}
