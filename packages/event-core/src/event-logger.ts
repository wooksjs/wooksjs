import {
    ProstoLogger,
    TProstoLoggerOptions,
    coloredConsole,
    createConsoleTransort,
} from '@prostojs/logger'
import { TEventOptions } from './context'

export interface TEventLoggerData {
    eventId: string
}

export class EventLogger extends ProstoLogger<TEventLoggerData> {
    constructor(eventId: string, opts?: TEventOptions['eventLogger']) {
        const _opts: TProstoLoggerOptions<TEventLoggerData> =
            (opts as TProstoLoggerOptions<TEventLoggerData>) || {
                level: 4,
            }
        if (!_opts.mapper) {
            _opts.mapper = (msg) => ({
                ...msg,
                eventId,
            })
        }
        if (!_opts.transports) {
            _opts.transports = [
                createConsoleTransort<TEventLoggerData>({
                    format: coloredConsole,
                }),
            ]
        }
        super(_opts, opts?.topic || 'event')
    }
}
