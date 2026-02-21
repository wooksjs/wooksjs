import type { EventLogger } from './event-logger'

/** Base event shape shared by all event types. */
export interface TGenericEvent {
  type: string
  logger?: EventLogger
  id?: string
}

/** Empty record type used as a default generic parameter. */
// eslint-disable-next-line typescript/no-empty-interface -- intentional empty base type
export type TEmpty = Record<string, never>
