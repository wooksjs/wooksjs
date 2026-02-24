import { key } from './key'

export const routeParamsKey = key<Record<string, string | string[]>>('routeParams')
export const eventTypeKey = key<string>('eventType')
