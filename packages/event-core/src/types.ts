import type { EventLogger } from './event-logger'

export interface TGenericEvent {
  type: string
  logger?: EventLogger
  id?: string
}

// eslint-disable-next-line typescript/no-empty-interface -- intentional empty base type
export type TEmpty = Record<string, never>
