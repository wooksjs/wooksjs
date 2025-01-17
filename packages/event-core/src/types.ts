import type { EventLogger } from './event-logger'

export interface TGenericEvent {
  type: string
  logger?: EventLogger
  id?: string
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface TEmpty {}
