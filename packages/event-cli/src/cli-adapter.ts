import { TWooksSubscribeAdapter, TWooksLookupArgs, TWooksLookupHandlers } from 'wooks'
import { logError } from 'common/log'
import { createCliContext } from './event-cli'

export const cliShortcuts = {
    cli: 'CLI',
}

export class WooksCli implements TWooksSubscribeAdapter {
    async subscribe(lookup: (route: TWooksLookupArgs) => TWooksLookupHandlers | null) {
        const argv = process.argv.slice(2)
        const firstFlagIndex = argv.findIndex(a => a.startsWith('-')) + 1
        const routing = { method: 'CLI', url: '/' + (firstFlagIndex ? argv.slice(0, firstFlagIndex - 1) : argv).map(v => encodeURIComponent(v)).join('/') }
        const { restoreCtx, clearCtx } = createCliContext({ argv })
        const handlers = lookup(routing)
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
