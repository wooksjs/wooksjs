import { EventLogger } from './event-logger'

export interface TGenericEvent {
    type: string
    logger?: EventLogger
    id?: string
}

export interface TEmpty {}
