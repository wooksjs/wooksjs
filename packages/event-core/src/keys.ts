import { key } from './key'

/** Context key for route parameters. Set by adapters after route matching. */
export const routeParamsKey = key<Record<string, string | string[]>>('routeParams')

/** Context key for the event type name (e.g. `'http'`, `'cli'`). Set by `ctx.seed()`. */
export const eventTypeKey = key<string>('eventType')
