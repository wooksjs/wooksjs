import type { TProstoLoggerOptions } from '@prostojs/logger'
import { coloredConsole, createConsoleTransort, ProstoLogger } from '@prostojs/logger'

import type { TEventOptions } from './context'

/** Data shape passed through logger transports, carrying the event ID. */
export interface TEventLoggerData {
  eventId: string
}

/** Logger scoped to a single event, automatically tagging messages with the event ID. */
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
